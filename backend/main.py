"""
Acumen — FastAPI Backend Entry Point
=====================================
Run with:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Endpoints
---------
GET  /                          → health check (public)
POST /upload                    → ingest PDF → return cluster preview [auth]
POST /synthesize/{session_id}   → kick off LangGraph swarm (background) [auth]
GET  /status/{session_id}       → poll processing status + cluster data [auth]
POST /chat                      → run Action Agent → structured tool response [auth]
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load .env (GOOGLE_API_KEY etc.) before any engine imports
load_dotenv()

from engine.ingest import ingest_pdf, ingest_url                  # noqa: E402
from engine.wiki_swarm import run_wiki_swarm, build_reactflow_data  # noqa: E402
from engine.action_agent import run_agent_chat                  # noqa: E402
from engine.audio import generate_audio_script                  # noqa: E402
from engine.auth import ClerkUser, get_current_user             # noqa: E402
from engine.audio_generator import generate_podcast_audio       # noqa: E402

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("acumen.main")


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀  Acumen backend starting …")
    db.init_db()
    yield
    logger.info("🛑  Acumen backend shutting down …")


app = FastAPI(
    title="Acumen API",
    description="NotebookLM++ — ML-powered executable knowledge base.",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow everything for local dev and prevent 'Failed to Fetch'
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False, # Must be False if allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class ClusterPreview(BaseModel):
    cluster_id: int
    chunk_count: int
    preview: str          # first 300 chars of the first chunk


class UploadResponse(BaseModel):
    message: str
    total_chunks: int
    clusters: List[ClusterPreview]
    # The full cluster map is stored server-side in app.state for the swarm
    session_id: str


class WikiPageOut(BaseModel):
    cluster_id: int
    topic_title: str
    summary: str
    key_terms: List[str]
    insights: List[str]


class SynthesizeResponse(BaseModel):
    session_id: str
    wiki_pages: List[WikiPageOut]
    errors: List[str] = []


class HistoryItem(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    session_id: str
    message: str
    history: List[HistoryItem] = []


class ChatResponse(BaseModel):
    response: str
    tool_used: Optional[str] = None
    tool_output: Any = None
    is_web_augmented: bool = False


# ReactFlow graph-data models
class NodeData(BaseModel):
    label: str
    summary: str
    cluster_id: int


class ReactFlowNode(BaseModel):
    id: str
    type: str
    position: Dict[str, float]
    data: NodeData


class UrlRequest(BaseModel):
    url: str
    session_id: Optional[str] = None


class EdgeStyle(BaseModel):
    stroke: str = "#7c3aed"


class ReactFlowEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str = ""
    animated: bool = True
    style: Optional[EdgeStyle] = None


class GraphDataResponse(BaseModel):
    nodes: List[ReactFlowNode]
    edges: List[ReactFlowEdge]


class NotebookSummary(BaseModel):
    id: str
    title: str
    status: str
    created_at: str
    source_type: str = "pdf"


class NotebooksResponse(BaseModel):
    notebooks: List[NotebookSummary]


# ---------------------------------------------------------------------------
# Persistent storage paths — /var/data is Render's mounted disk
# ---------------------------------------------------------------------------

DATA_DIR: str = os.getenv("ACUMEN_DATA_DIR", "./data")
DB_PATH: str = os.path.join(DATA_DIR, "acumen.db")

# Propagate the ChromaDB path so wiki_swarm picks it up at import time
os.environ.setdefault("ACUMEN_CHROMA_PATH", os.path.join(DATA_DIR, "chroma_db"))


# ---------------------------------------------------------------------------
# SQLite Database — persistent notebook registry
# ---------------------------------------------------------------------------


class Database:
    """Thin synchronous SQLite wrapper for notebook persistence.

    Schema
    ------
    notebooks(
        id            TEXT PRIMARY KEY,   -- session UUID
        title         TEXT,               -- original filename
        session_id    TEXT UNIQUE,        -- same as id (kept for clarity)
        status        TEXT,               -- 'processing' | 'completed' | 'error'
        clusters_json TEXT,               -- JSON-serialised cluster map
        clerk_id      TEXT,               -- Clerk user ID (sub claim)
        created_at    TEXT                -- ISO timestamp
    )
    """

    def __init__(self, path: str = DB_PATH) -> None:
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        """Create tables and run lightweight schema migrations."""
        # Ensure the data directory exists (critical on Render first boot)
        os.makedirs(os.path.dirname(self.path), exist_ok=True)

        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS notebooks (
                    id            TEXT PRIMARY KEY,
                    title         TEXT NOT NULL,
                    session_id    TEXT UNIQUE NOT NULL,
                    status        TEXT NOT NULL DEFAULT 'processing',
                    clusters_json TEXT,
                    clerk_id      TEXT NOT NULL DEFAULT '',
                    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    source_type   TEXT NOT NULL DEFAULT 'pdf'
                )
                """
            )
            # Migration guards: add missing columns to pre-existing databases
            existing_cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(notebooks)").fetchall()
            }
            if "clerk_id" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN clerk_id TEXT NOT NULL DEFAULT ''"
                )
                logger.info("Migration: added 'clerk_id' column to notebooks.")
            if "created_at" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
                )
                logger.info("Migration: added 'created_at' column to notebooks.")
            if "source_type" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN source_type TEXT NOT NULL DEFAULT 'pdf'"
                )
                logger.info("Migration: added 'source_type' column to notebooks.")
            conn.commit()
        logger.info("SQLite database ready at '%s'.", self.path)

    def save_notebook(
        self,
        session_id: str,
        title: str,
        clusters: Dict[int, List[str]],
        clerk_id: str = "",
        source_type: str = "pdf",
    ) -> None:
        """Insert a new notebook row with status='processing'."""
        # JSON keys must be strings; convert int cluster IDs
        clusters_json = json.dumps({str(k): v for k, v in clusters.items()})
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO notebooks
                    (id, title, session_id, status, clusters_json, clerk_id, source_type)
                VALUES (?, ?, ?, 'processing', ?, ?, ?)
                """,
                (session_id, title, session_id, clusters_json, clerk_id, source_type),
            )
            conn.commit()
        logger.info(
            "Notebook '%s' saved (session=%s, clerk_id=%s).",
            title, session_id, clerk_id,
        )

    def update_status(
        self,
        session_id: str,
        status: str,
    ) -> None:
        """Update the processing status of a notebook."""
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET status = ? WHERE session_id = ?",
                (status, session_id),
            )
            conn.commit()

    def get_notebook(self, session_id: str) -> Optional[sqlite3.Row]:
        """Return the notebook row or None if not found."""
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM notebooks WHERE session_id = ?",
                (session_id,),
            ).fetchone()

    def get_notebooks_for_user(self, clerk_id: str) -> List[sqlite3.Row]:
        """Return all notebook rows belonging to a specific Clerk user."""
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM notebooks WHERE clerk_id = ? ORDER BY rowid DESC",
                (clerk_id,),
            ).fetchall()


db = Database()


# ---------------------------------------------------------------------------
# In-memory session store — fast cache for cluster data during a process lifetime
# ---------------------------------------------------------------------------
_sessions: Dict[str, Dict[int, List[str]]] = {}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", tags=["health"])
async def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "Acumen API v0.1.0"}


@app.post("/upload", response_model=UploadResponse, tags=["ingestion"])
async def upload_pdf(
    background_tasks: BackgroundTasks,
    session_id: Optional[str] = None,
    file: UploadFile = File(...),
    user: ClerkUser = Depends(get_current_user),
) -> UploadResponse:
    """
    Accepts a PDF, runs the ML clustering pipeline, and returns a
    structured preview of the discovered topic clusters.
    If session_id is provided, appends the chunks to the existing notebook.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    try:
        pdf_bytes: bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read file: {exc}") from exc

    if len(pdf_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        new_clusters: Dict[int, List[str]] = ingest_pdf(pdf_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion error: {exc}") from exc

    if session_id:
        row = db.get_notebook(session_id)
        if not row or row["clerk_id"] != user.clerk_id:
            raise HTTPException(status_code=403, detail="Forbidden or not found")
        
    if not session_id:
        session_id = str(uuid.uuid4())

    # 2. Start background ingestion + synthesis
    # We move EVERYTHING to the background so the user gets an immediate response.
    background_tasks.add_task(
        _run_full_ingestion_background, session_id, file.filename or "Untitled", pdf_bytes, user.clerk_id
    )
    logger.info("Full ingestion pipeline enqueued for session %s.", session_id)

    return UploadResponse(
        message=f"📥 '{file.filename}' received. Processing in background…",
        total_chunks=0, # Will be updated in DB later
        clusters=[],
        session_id=session_id,
    )


@app.post("/upload-url", tags=["ingestion"], status_code=202)
async def upload_url(
    req: UrlRequest,
    background_tasks: BackgroundTasks,
    user: ClerkUser = Depends(get_current_user),
) -> Dict[str, str]:
    """
    Ingest a website URL, extract its text, cluster it, and immediately
    dispatch the LangGraph synthesis swarm in the background.
    If session_id is provided, appends the chunks to the existing notebook.
    """
    if not req.url:
        raise HTTPException(status_code=400, detail="URL cannot be empty.")

    try:
        new_clusters: Dict[int, List[str]] = ingest_url(req.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion error: {exc}") from exc

    session_id = req.session_id or str(uuid.uuid4())

    background_tasks.add_task(
        _run_url_ingestion_background, session_id, req.url, user.clerk_id
    )
    logger.info("URL ingestion pipeline enqueued for session %s.", session_id)

    return {"status": "processing", "session_id": session_id}


# ---------------------------------------------------------------------------
# Expose session store for internal use by other engine modules
# ---------------------------------------------------------------------------

def get_session(session_id: str) -> Dict[int, List[str]]:
    """Retrieve a cluster map by session_id. Rehydrates from SQLite if needed."""
    if session_id in _sessions:
        return _sessions[session_id]
    
    # Rehydration logic
    row = db.get_notebook(session_id)
    if not row:
        raise KeyError(f"Session '{session_id}' not found. Upload a PDF first.")
    
    try:
        raw_clusters = json.loads(row["clusters_json"] or "{}")
        clusters = {int(k): v for k, v in raw_clusters.items()}
        _sessions[session_id] = clusters
        logger.info("Session %s rehydrated from SQLite.", session_id)
        return clusters
    except Exception as exc:
        logger.error("Failed to rehydrate session %s: %s", session_id, exc)
        raise KeyError(f"Session '{session_id}' exists but is corrupted.") from exc


def _run_full_ingestion_background(session_id: str, title: str, pdf_bytes: bytes, clerk_id: str) -> None:
    """Worker for full async PDF ingestion pipeline (handles new and append)."""
    try:
        # Check if we are appending
        row = db.get_notebook(session_id)
        existing_clusters = {}
        if row:
            existing_clusters = json.loads(row["clusters_json"] or "{}")
            logger.info("Appending to existing session %s", session_id)
        else:
            db.save_notebook(session_id, title, {}, clerk_id)

        db.update_status(session_id, "ingesting")
        
        new_clusters = ingest_pdf(pdf_bytes)
        # Convert new clusters keys to strings for consistency
        new_clusters_str = {str(k): v for k, v in new_clusters.items()}
        
        # Merge clusters if appending
        if existing_clusters:
            existing_keys = [int(k) for k in existing_clusters.keys()]
            offset = max(existing_keys) + 1 if existing_keys else 0
            offset_new = {str(int(k) + offset): v for k, v in new_clusters_str.items()}
            combined = {**existing_clusters, **offset_new}
            db.save_notebook(session_id, row["title"], combined, clerk_id, source_type="pdf")
            # Re-convert to int keys for in-memory session
            _sessions[session_id] = {int(k): v for k, v in combined.items()}
            swarm_clusters = {int(k): v for k, v in offset_new.items()} # Only swarm the new ones
        else:
            db.save_notebook(session_id, title, new_clusters, clerk_id, source_type="pdf")
            _sessions[session_id] = new_clusters
            swarm_clusters = new_clusters

        db.update_status(session_id, "synthesizing")
        run_wiki_swarm(session_id=session_id, clusters=swarm_clusters)
        db.update_status(session_id, "completed")
    except Exception as exc:
        logger.exception("[BG] Ingestion failed for session %s: %s", session_id, exc)
        db.update_status(session_id, "error")


def _run_url_ingestion_background(session_id: str, url: str, clerk_id: str) -> None:
    """Worker for full async URL ingestion pipeline (handles new and append)."""
    try:
        # Check if we are appending
        row = db.get_notebook(session_id)
        existing_clusters = {}
        if row:
            existing_clusters = json.loads(row["clusters_json"] or "{}")
            logger.info("Appending URL to existing session %s", session_id)
        else:
            title = url.split("//")[-1].split("/")[0]
            db.save_notebook(session_id, title, {}, clerk_id)

        db.update_status(session_id, "ingesting")
        
        new_clusters = ingest_url(url)
        new_clusters_str = {str(k): v for k, v in new_clusters.items()}
        
        # Merge clusters if appending
        if existing_clusters:
            existing_keys = [int(k) for k in existing_clusters.keys()]
            offset = max(existing_keys) + 1 if existing_keys else 0
            offset_new = {str(int(k) + offset): v for k, v in new_clusters_str.items()}
            combined = {**existing_clusters, **offset_new}
            db.save_notebook(session_id, row["title"], combined, clerk_id, source_type="url")
            _sessions[session_id] = {int(k): v for k, v in combined.items()}
            swarm_clusters = {int(k): v for k, v in offset_new.items()}
        else:
            db.save_notebook(session_id, url.split("//")[-1].split("/")[0], new_clusters, clerk_id, source_type="url")
            _sessions[session_id] = new_clusters
            swarm_clusters = new_clusters

        db.update_status(session_id, "synthesizing")
        run_wiki_swarm(session_id=session_id, clusters=swarm_clusters)
        db.update_status(session_id, "completed")
    except Exception as exc:
        logger.exception("[BG] URL ingestion failed for session %s: %s", session_id, exc)
        db.update_status(session_id, "error")


def _run_swarm_background(session_id: str, clusters: Dict[int, List[str]]) -> None:
    """Worker executed by BackgroundTasks — runs the LangGraph swarm and updates SQLite."""
    try:
        logger.info("[BG] Wiki swarm starting for session %s …", session_id)
        run_wiki_swarm(session_id=session_id, clusters=clusters)
        db.update_status(session_id, "completed")
        logger.info("[BG] Wiki swarm completed for session %s.", session_id)
    except Exception as exc:
        logger.exception("[BG] Wiki swarm failed for session %s: %s", session_id, exc)
        db.update_status(session_id, "error")


@app.post("/synthesize/{session_id}", tags=["swarm"])
async def synthesize(
    session_id: str,
    background_tasks: BackgroundTasks,
    user: ClerkUser = Depends(get_current_user),
) -> Dict[str, str]:
    """
    Kick off the LangGraph Synthesizer Swarm for a given session.
    Returns immediately with {"status": "processing"}.
    """
    row = db.get_notebook(session_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No notebook record found for session '{session_id}'. Upload a file first.",
        )
    
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # If already processing (because /upload dispatched it), just return safely.
    if row["status"] == "processing":
        return {"status": "processing", "session_id": session_id}

    try:
        clusters = get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    background_tasks.add_task(_run_swarm_background, session_id, clusters)
    logger.info("Swarm enqueued in background for session %s.", session_id)
    return {"status": "processing", "session_id": session_id}


# ---------------------------------------------------------------------------
# Status polling
# ---------------------------------------------------------------------------


class StatusResponse(BaseModel):
    session_id: str
    status: str                        # processing | completed | error
    clusters: Optional[List[ClusterPreview]] = None


@app.get("/status/{session_id}", response_model=StatusResponse, tags=["swarm"])
async def get_status(
    session_id: str,
    user: ClerkUser = Depends(get_current_user),
) -> StatusResponse:
    """
    Poll the processing status of a synthesis job.

    Returns the current status and, once completed, a lightweight cluster
    preview so the frontend can render the wiki immediately.
    """
    row = db.get_notebook(session_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found.",
        )

    # Ownership check — users can only read their own notebooks
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this notebook.",
        )

    status = row["status"]
    clusters_preview: Optional[List[ClusterPreview]] = None

    if status == "completed":
        # Deserialise cluster map and build preview
        try:
            raw_clusters: Dict[str, List[str]] = json.loads(row["clusters_json"] or "{}")
            clusters_preview = [
                ClusterPreview(
                    cluster_id=int(cid),
                    chunk_count=len(chunks),
                    preview=chunks[0][:300] if chunks else "",
                )
                for cid, chunks in sorted(raw_clusters.items(), key=lambda x: int(x[0]))
            ]
        except Exception as exc:
            logger.warning("Could not build cluster preview for %s: %s", session_id, exc)

    return StatusResponse(
        session_id=session_id,
        status=status,
        clusters=clusters_preview,
    )


@app.post("/chat", response_model=ChatResponse, tags=["agent"])
async def chat_endpoint(
    req: ChatRequest,
    user: ClerkUser = Depends(get_current_user),
) -> ChatResponse:
    """
    Send a message to the Action Agent for the given session.

    The agent queries acumen_wiki and routes to one of 5 tools based on intent,
    returning a structured response the frontend can render as rich UI.
    """
    try:
        get_session(req.session_id)          # confirm session exists in memory
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Ownership check
    nb_row = db.get_notebook(req.session_id)
    if nb_row and nb_row["clerk_id"] and nb_row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="You do not have access to this notebook.")

    history = [h.model_dump() for h in req.history]

    try:
        result = await run_agent_chat(
            session_id=req.session_id,
            user_message=req.message,
            history=history,
        )
        
        # Safely extract text whether Gemini returns a string or a list of blocks
        content = result.get("response", "")
        if isinstance(content, list):
            parsed_text = " ".join([item.get("text", "") for item in content if isinstance(item, dict) and "text" in item])
            result["response"] = parsed_text
        else:
            result["response"] = str(content)
            
        return ChatResponse(**result)
    except Exception as exc:
        logger.exception("Agent chat failed for session %s.", req.session_id)
        return ChatResponse(response=f"Backend Error: {str(exc)}")


@app.get("/graph-data/{session_id}", response_model=GraphDataResponse, tags=["graph"])
async def graph_data(session_id: str, user: ClerkUser = Depends(get_current_user)) -> GraphDataResponse:
    """
    Return a ReactFlow-compatible graph payload for the given session.

    Nodes  — one per synthesized Wiki Page topic (circle layout).
    Edges  — 1-2 LLM-generated relationships between topics.

    Call this after /synthesize has completed.
    """
    try:
        get_session(session_id)   # verify session exists
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    nb_row = db.get_notebook(session_id)
    if nb_row and nb_row["clerk_id"] and nb_row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        data = build_reactflow_data(session_id)
    except Exception as exc:
        logger.exception("Graph data build failed for session %s.", session_id)
        raise HTTPException(status_code=500, detail=f"Graph error: {exc}") from exc

    if not data["nodes"]:
        raise HTTPException(
            status_code=404,
            detail="No wiki pages found. Run /synthesize first.",
        )

    return GraphDataResponse(
        nodes=[ReactFlowNode(**n) for n in data["nodes"]],
        edges=[ReactFlowEdge(**e) for e in data["edges"]],
    )


@app.get("/generate-podcast/{session_id}", tags=["audio"])
async def generate_podcast(session_id: str, user: ClerkUser = Depends(get_current_user)):
    """
    Generate a 30-second back-and-forth podcast script for the given session.
    """
    try:
        get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    nb_row = db.get_notebook(session_id)
    if nb_row and nb_row["clerk_id"] and nb_row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        script = generate_audio_script(session_id)
        return {"script": script}
    except Exception as exc:
        logger.exception("Audio script generation failed for session %s.", session_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/generate-audio/{session_id}", tags=["audio"])
async def generate_audio(session_id: str, user: ClerkUser = Depends(get_current_user)):
    """
    Generate a TTS audio file using Hugging Face's Inference API based on the 
    notebook's synthesized text, and return the .wav file.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        raw_clusters: Dict[str, List[str]] = json.loads(row["clusters_json"] or "{}")
        # Condense the text for the TTS API (it has strict limits)
        intro = "Welcome to the Acumen Podcast. Here are the key insights: "
        body = []
        for cid, chunks in list(raw_clusters.items())[:3]: # Take first 3 clusters
            if chunks:
                body.append(chunks[0][:150]) # Take first 150 chars of each
        text_to_speak = intro + ". ".join(body)

        file_path = await generate_podcast_audio(text_to_speak, session_id)
        return FileResponse(path=file_path, media_type="audio/wav", filename=f"podcast_{session_id}.wav")
    except HTTPException:
        # Re-raise HTTPExceptions so FastAPI handles them with the correct status code
        raise
    except Exception as exc:
        logger.exception("Audio generation failed for session %s.", session_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/notebooks", response_model=NotebooksResponse, tags=["user"])
async def get_notebooks(user: ClerkUser = Depends(get_current_user)) -> NotebooksResponse:
    """
    Fetch all notebook summaries for the authenticated user.
    Results are ordered by newest first and exclude heavy payload data like clusters_json.
    """
    rows = db.get_notebooks_for_user(user.clerk_id)
    notebooks = [
        NotebookSummary(
            id=r["id"],
            title=r["title"],
            status=r["status"],
            created_at=r["created_at"],
            source_type=r["source_type"] if "source_type" in r.keys() else "pdf"
        )
        for r in rows
    ]
    return NotebooksResponse(notebooks=notebooks)
