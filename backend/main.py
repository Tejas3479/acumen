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

import asyncio
import json
import logging
import os
import sqlite3
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Rate Limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

# LangChain 0.3 Compatibility Monkeypatch (verbose attribute removed in 0.3)
import langchain
if not hasattr(langchain, "verbose"):
    langchain.verbose = False

# Load .env (GOOGLE_API_KEY etc.) before any engine imports
load_dotenv()

# Secure key decryption at rest (OWASP A02:2021)
from engine.key_manager import initialize_keys
initialize_keys()

# ---------------------------------------------------------------------------
# Persistent storage paths — configured BEFORE engine imports
# ---------------------------------------------------------------------------
DATA_DIR: str = os.getenv("ACUMEN_DATA_DIR", "./data")
# Ensure the data directory exists immediately
os.makedirs(DATA_DIR, exist_ok=True)

# Propagate the ChromaDB path so wiki_swarm picks it up at import time
os.environ.setdefault("ACUMEN_CHROMA_PATH", os.path.join(DATA_DIR, "chroma_db"))

from engine.ingest import ingest_file, ingest_url                  # noqa: E402
from engine.ingest_v2 import ingest_document_v2, ingest_url_v2      # noqa: E402
from engine.wiki_swarm import run_wiki_swarm, build_reactflow_data  # noqa: E402
from engine.action_agent import run_agent_chat                  # noqa: E402
from engine.audio import generate_audio_script                  # noqa: E402
from engine.auth import ClerkUser, get_current_user             # noqa: E402
from engine.audio_generator import generate_podcast_audio       # noqa: E402
from engine.sanitizer import sanitize_chat_input, is_safe_url   # noqa: E402
from engine.audit import (                                      # noqa: E402
    log_event,
    get_client_ip,
    AUDIT_UPLOAD,
    AUDIT_SYNTHESIZE,
    AUDIT_CHAT,
    AUDIT_GRAPH_ACCESS,
    AUDIT_INJECTION_BLOCK,
    AUDIT_URL_BLOCKED,
)

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
# HTTPS Enforcement Middleware (OWASP A02:2021)
# ---------------------------------------------------------------------------
@app.middleware("http")
async def enforce_https_middleware(request: Request, call_next):
    if os.getenv("ENVIRONMENT") == "production":
        proto = request.headers.get("X-Forwarded-Proto")
        if proto == "http" or request.url.scheme == "http":
            if request.url.hostname not in ("localhost", "127.0.0.1"):
                url = request.url.replace(scheme="https")
                from fastapi.responses import RedirectResponse
                return RedirectResponse(url, status_code=307)
    return await call_next(request)


# ---------------------------------------------------------------------------
# CORS & Rate Limiting (P0.2 & P0.3)
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = os.getenv("ACUMEN_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
# If we have "*" in origins, set allow_credentials to False, otherwise True
allow_creds = True
if "*" in ALLOWED_ORIGINS:
    allow_creds = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=allow_creds,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ---------------------------------------------------------------------------
# Model Context Protocol (P5.3)
# ---------------------------------------------------------------------------
from engine.mcp_server import mcp
app.mount("/mcp", mcp.sse_app())


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class ClusterPreview(BaseModel):
    cluster_id: int
    chunk_count: int
    preview: str          # first 300 chars of the first chunk


class UploadResponse(BaseModel):
    message: str
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
    history: List[HistoryItem] = []


class NotebooksResponse(BaseModel):
    notebooks: List[NotebookSummary]


# ---------------------------------------------------------------------------
# Persistent storage paths — /var/data is Render's mounted disk
# ---------------------------------------------------------------------------

# Persistent storage paths already configured at top of file
DB_PATH: str = os.path.join(DATA_DIR, "acumen.db")


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
            if "history_json" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN history_json TEXT NOT NULL DEFAULT '[]'"
                )
                logger.info("Migration: added 'history_json' column to notebooks.")
            if "notes_json" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN notes_json TEXT NOT NULL DEFAULT '{}'"
                )
                logger.info("Migration: added 'notes_json' column to notebooks.")
            if "snippets_json" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN snippets_json TEXT NOT NULL DEFAULT '[]'"
                )
                logger.info("Migration: added 'snippets_json' column to notebooks.")
            if "links_json" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]'"
                )
                logger.info("Migration: added 'links_json' column to notebooks.")
            if "sources_json" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]'"
                )
                logger.info("Migration: added 'sources_json' column to notebooks.")
            if "flashcard_progress_json" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN flashcard_progress_json TEXT NOT NULL DEFAULT '{}'"
                )
                logger.info("Migration: added 'flashcard_progress_json' column to notebooks.")
            if "share_token" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN share_token TEXT"
                )
                logger.info("Migration: added 'share_token' column to notebooks.")
            if "graph_layout_json" not in existing_cols:
                conn.execute(
                    "ALTER TABLE notebooks ADD COLUMN graph_layout_json TEXT NOT NULL DEFAULT '{}'"
                )
                logger.info("Migration: added 'graph_layout_json' column to notebooks.")
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

    def update_history(self, session_id: str, history: List[Dict[str, Any]]) -> None:
        """Update the chat history for a notebook."""
        history_json = json.dumps(history)
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET history_json = ? WHERE session_id = ?",
                (history_json, session_id),
            )
            conn.commit()
        logger.info("Chat history updated for session %s (%d messages).", session_id, len(history))

    def update_notes(self, session_id: str, notes: Dict[str, str]) -> None:
        """Update the notes JSON for a notebook."""
        notes_json = json.dumps(notes)
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET notes_json = ? WHERE session_id = ?",
                (notes_json, session_id),
            )
            conn.commit()

    def update_snippets(self, session_id: str, snippets: List[Dict[str, Any]]) -> None:
        """Update the snippets JSON for a notebook."""
        snippets_json = json.dumps(snippets)
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET snippets_json = ? WHERE session_id = ?",
                (snippets_json, session_id),
            )
            conn.commit()

    def update_links(self, session_id: str, links: List[Dict[str, Any]]) -> None:
        """Update the links JSON for a notebook."""
        links_json = json.dumps(links)
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET links_json = ? WHERE session_id = ?",
                (links_json, session_id),
            )
            conn.commit()

    def update_sources(self, session_id: str, sources: List[Dict[str, Any]]) -> None:
        """Update the sources JSON for a notebook."""
        sources_json = json.dumps(sources)
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET sources_json = ? WHERE session_id = ?",
                (sources_json, session_id),
            )
            conn.commit()

    def update_flashcard_progress(self, session_id: str, progress: Dict[str, Any]) -> None:
        """Update the flashcard progress JSON for a notebook."""
        progress_json = json.dumps(progress)
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET flashcard_progress_json = ? WHERE session_id = ?",
                (progress_json, session_id),
            )
            conn.commit()

    def update_graph_layout(self, session_id: str, layout: Dict[str, Any]) -> None:
        """Update the graph layout JSON for a notebook."""
        layout_json = json.dumps(layout)
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET graph_layout_json = ? WHERE session_id = ?",
                (layout_json, session_id),
            )
            conn.commit()

    def update_share_token(self, session_id: str, share_token: Optional[str]) -> None:
        """Update the share token for a notebook."""
        with self._connect() as conn:
            conn.execute(
                "UPDATE notebooks SET share_token = ? WHERE session_id = ?",
                (share_token, session_id),
            )
            conn.commit()

    def get_notebook(self, session_id: str) -> Optional[sqlite3.Row]:
        """Fetch a single notebook row by session_id."""
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM notebooks WHERE session_id = ?", (session_id,)
            ).fetchone()

    def get_notebooks_for_user(self, clerk_id: str) -> List[sqlite3.Row]:
        """Fetch all notebooks for a given clerk_id, newest first."""
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM notebooks WHERE clerk_id = ? ORDER BY created_at DESC",
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
@limiter.limit("10/minute")
async def upload_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    session_id: Optional[str] = None,
    file: UploadFile = File(...),
    user: ClerkUser = Depends(get_current_user),
) -> UploadResponse:
    """
    Accepts a PDF, DOCX, TXT, MD, or HTML document, runs the ML clustering pipeline,
    and returns a structured preview of the discovered topic clusters.
    If session_id is provided, appends the chunks to the existing notebook.
    """
    ALLOWED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md", ".html")
    if not file.filename or not file.filename.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"Only the following formats are allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        file_bytes: bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read file: {exc}") from exc

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if session_id:
        row = db.get_notebook(session_id)
        if not row or row["clerk_id"] != user.clerk_id:
            raise HTTPException(status_code=403, detail="Forbidden or not found")
        
    if not session_id:
        session_id = str(uuid.uuid4())

    # Log successful ingestion enqueuing event to audit trail
    ext = (file.filename or "").lower().split(".")[-1]
    source_type = ext if ext in ("pdf", "docx", "txt", "md", "html") else "pdf"
    log_event(
        AUDIT_UPLOAD,
        user_id=user.clerk_id,
        session_id=session_id,
        ip_address=get_client_ip(request),
        filename=file.filename or "Untitled",
        source_type=source_type,
    )

    # 2. Start background ingestion + synthesis
    # We move EVERYTHING to the background so the user gets an immediate response.
    background_tasks.add_task(
        _run_full_ingestion_background, session_id, file.filename or "Untitled", file_bytes, user.clerk_id
    )
    logger.info("Full ingestion pipeline enqueued for session %s.", session_id)

    return UploadResponse(
        message=f"📥 '{file.filename}' received. Processing in background…",
        session_id=session_id,
    )


@app.post("/upload-url", tags=["ingestion"], status_code=202)
@limiter.limit("10/minute")
async def upload_url(
    request: Request,
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

    # Prevent SSRF (OWASP A05:2021)
    if not is_safe_url(req.url):
        log_event(
            AUDIT_URL_BLOCKED,
            user_id=user.clerk_id,
            ip_address=get_client_ip(request),
            url=req.url,
        )
        raise HTTPException(
            status_code=400,
            detail="Unsafe URL blocked: local and private ranges are prohibited."
        )

    session_id = req.session_id or str(uuid.uuid4())

    log_event(
        AUDIT_UPLOAD,
        user_id=user.clerk_id,
        session_id=session_id,
        ip_address=get_client_ip(request),
        url=req.url,
        source_type="url",
    )

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


async def _run_full_ingestion_background(session_id: str, title: str, file_bytes: bytes, clerk_id: str) -> None:
    """Worker for full async file ingestion pipeline (handles new and append)."""
    import time
    source_id = f"src_{uuid.uuid4().hex[:8]}"
    ext = title.lower().split(".")[-1]
    source_type = ext if ext in ("pdf", "docx", "txt", "md", "html") else "pdf"
    
    try:
        # Check if we are appending
        row = db.get_notebook(session_id)
        existing_clusters = {}
        sources = []
        
        if row:
            existing_clusters = json.loads(row["clusters_json"] or "{}")
            logger.info("Appending to existing session %s", session_id)
            if "sources_json" in row.keys() and row["sources_json"]:
                try:
                    sources = json.loads(row["sources_json"])
                except Exception:
                    sources = []
        else:
            db.save_notebook(session_id, title, {}, clerk_id, source_type=source_type)

        new_source = {
            "source_id": source_id,
            "title": title,
            "source_type": source_type,
            "status": "processing",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        sources.append(new_source)
        db.update_sources(session_id, sources)

        new_clusters = await ingest_document_v2(file_bytes, title, session_id, source_id=source_id)
        # Convert new clusters keys to strings for consistency
        new_clusters_str = {str(k): v for k, v in new_clusters.items()}
        
        # Merge clusters if appending
        if existing_clusters:
            existing_keys = [int(k) for k in existing_clusters.keys()]
            offset = max(existing_keys) + 1 if existing_keys else 0
            offset_new = {str(int(k) + offset): v for k, v in new_clusters_str.items()}
            combined = {**existing_clusters, **offset_new}
            db.save_notebook(session_id, row["title"], combined, clerk_id, source_type=row["source_type"])
            # Re-convert to int keys for in-memory session
            _sessions[session_id] = {int(k): v for k, v in combined.items()}
            swarm_clusters = {int(k): v for k, v in offset_new.items()} # Only swarm the new ones
        else:
            db.save_notebook(session_id, title, new_clusters, clerk_id, source_type=source_type)
            _sessions[session_id] = new_clusters
            swarm_clusters = new_clusters

        # Update source status to completed
        for s in sources:
            if s["source_id"] == source_id:
                s["status"] = "completed"
        db.update_sources(session_id, sources)

        db.update_status(session_id, "synthesizing")
        await run_wiki_swarm(session_id=session_id, clusters=swarm_clusters)
        db.update_status(session_id, "completed")
    except Exception as exc:
        logger.exception("[BG] Ingestion failed for session %s: %s", session_id, exc)
        db.update_status(session_id, "error")
        # Mark source as error
        try:
            row = db.get_notebook(session_id)
            if row and "sources_json" in row.keys() and row["sources_json"]:
                sources = json.loads(row["sources_json"])
                for s in sources:
                    if s["source_id"] == source_id:
                        s["status"] = "error"
                db.update_sources(session_id, sources)
        except Exception:
            pass


async def _run_url_ingestion_background(session_id: str, url: str, clerk_id: str) -> None:
    """Worker for full async URL ingestion pipeline (handles new and append)."""
    import time
    source_id = f"src_{uuid.uuid4().hex[:8]}"
    title = url.split("//")[-1].split("/")[0]
    
    try:
        # Check if we are appending
        row = db.get_notebook(session_id)
        existing_clusters = {}
        sources = []
        
        if row:
            existing_clusters = json.loads(row["clusters_json"] or "{}")
            logger.info("Appending URL to existing session %s", session_id)
            if "sources_json" in row.keys() and row["sources_json"]:
                try:
                    sources = json.loads(row["sources_json"])
                except Exception:
                    sources = []
        else:
            db.save_notebook(session_id, title, {}, clerk_id)

        new_source = {
            "source_id": source_id,
            "title": url,
            "source_type": "url",
            "status": "processing",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        sources.append(new_source)
        db.update_sources(session_id, sources)

        new_clusters = await ingest_url_v2(url, session_id, source_id=source_id)
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

        # Update source status to completed
        for s in sources:
            if s["source_id"] == source_id:
                s["status"] = "completed"
        db.update_sources(session_id, sources)

        db.update_status(session_id, "synthesizing")
        await run_wiki_swarm(session_id=session_id, clusters=swarm_clusters)
        db.update_status(session_id, "completed")
    except Exception as exc:
        logger.exception("[BG] URL ingestion failed for session %s: %s", session_id, exc)
        db.update_status(session_id, "error")
        # Mark source as error
        try:
            row = db.get_notebook(session_id)
            if row and "sources_json" in row.keys() and row["sources_json"]:
                sources = json.loads(row["sources_json"])
                for s in sources:
                    if s["source_id"] == source_id:
                        s["status"] = "error"
                db.update_sources(session_id, sources)
        except Exception:
            pass


@app.post("/synthesize/{session_id}", tags=["swarm"])
async def synthesize(
    request: Request,
    session_id: str,
    background_tasks: BackgroundTasks,
    user: ClerkUser = Depends(get_current_user),
) -> Dict[str, str]:
    """
    Trigger re-synthesis of Wiki pages for a given session.
    """
    row = db.get_notebook(session_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No notebook record found for session '{session_id}'. Upload a file first.",
        )
    
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        clusters = get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    log_event(
        AUDIT_SYNTHESIZE,
        user_id=user.clerk_id,
        session_id=session_id,
        ip_address=get_client_ip(request),
    )

    async def run_re_synthesis():
        try:
            db.update_status(session_id, "synthesizing")
            await run_wiki_swarm(session_id=session_id, clusters=clusters)
            db.update_status(session_id, "completed")
        except Exception as exc:
            logger.exception("Re-synthesis failed: %s", exc)
            db.update_status(session_id, "error")

    background_tasks.add_task(run_re_synthesis)
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


@app.get("/status/{session_id}/stream", tags=["swarm"])
async def status_stream(
    session_id: str,
    user: ClerkUser = Depends(get_current_user),
):
    """
    Establish a Server-Sent Events (SSE) connection to stream notebook processing status in real-time.
    """
    # 1. Verify existence of the notebook first
    row = db.get_notebook(session_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found.",
        )

    # 2. Ownership check
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this notebook.",
        )

    async def event_generator():
        import asyncio
        last_status = None
        
        # We poll the SQLite DB every 1 second and yield updates to the client
        for _ in range(300): # Limit to 5 minutes to prevent infinite hanging connections
            current_row = db.get_notebook(session_id)
            if not current_row:
                yield f"data: {json.dumps({'status': 'error', 'detail': 'Notebook deleted'})}\n\n"
                break
                
            current_status = current_row["status"]
            
            # If status changed, yield it
            if current_status != last_status:
                last_status = current_status
                payload = {"status": current_status}
                
                # If completed, include cluster preview
                if current_status == "completed":
                    try:
                        raw_clusters = json.loads(current_row["clusters_json"] or "{}")
                        clusters_preview = [
                            {
                                "cluster_id": int(cid),
                                "chunk_count": len(chunks),
                                "preview": chunks[0][:300] if chunks else "",
                            }
                            for cid, chunks in sorted(raw_clusters.items(), key=lambda x: int(x[0]))
                        ]
                        payload["clusters"] = clusters_preview
                    except Exception as exc:
                        logger.warning("Could not build cluster preview in SSE stream for %s: %s", session_id, exc)
                
                yield f"data: {json.dumps(payload)}\n\n"
            
            # If completed or error, stop streaming
            if current_status in ("completed", "error"):
                break
                
            await asyncio.sleep(1.0)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/chat", response_model=ChatResponse, tags=["agent"])
@limiter.limit("30/minute")
async def chat_endpoint(
    request: Request,
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

    # 1. Sanitize chat input (OWASP LLM01 - Prompt Injection Defense)
    sanitized_msg, warnings = sanitize_chat_input(req.message, user_id=user.clerk_id)
    
    # Extract client IP
    client_ip = get_client_ip(request)

    # Log injection blocks if patterns matched
    if warnings:
        for w in warnings:
            log_event(
                AUDIT_INJECTION_BLOCK,
                user_id=user.clerk_id,
                session_id=req.session_id,
                ip_address=client_ip,
                pattern_category=w,
                original_message=req.message[:100],  # log a small snippet
            )

    # 2. Log safe chat turn
    log_event(
        AUDIT_CHAT,
        user_id=user.clerk_id,
        session_id=req.session_id,
        ip_address=client_ip,
        message_length=len(sanitized_msg),
    )

    history = [h.model_dump() for h in req.history]

    try:
        result = await run_agent_chat(
            session_id=req.session_id,
            user_message=sanitized_msg,
            history=history,
            user_id=user.clerk_id,
            ip_address=client_ip or "",
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


@app.post("/chat/stream", tags=["agent"])
@limiter.limit("30/minute")
async def chat_stream(
    request: Request,
    req: ChatRequest,
    user: ClerkUser = Depends(get_current_user),
):
    """
    SSE stream endpoint for chat interactions.
    Streams token-by-token responses and sends tool outputs at the end of the stream.
    """
    row = db.get_notebook(req.session_id)
    if row and row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    sanitized_msg, warnings = sanitize_chat_input(req.message, user_id=user.clerk_id)
    client_ip = get_client_ip(request)

    async def event_generator():
        try:
            # Yield initial token or spawn logs
            yield f"data: {json.dumps({'token': '🧠 Swarm Director coordinating plan...'})}\n\n"
            await asyncio.sleep(0.05)
            
            result = await run_agent_chat(
                session_id=req.session_id,
                user_message=sanitized_msg,
                history=[h.model_dump() for h in req.history],
                user_id=user.clerk_id,
                ip_address=client_ip or ""
            )
            
            # Stream the conversational response character by character
            full_response = result.get("response", "")
            words = full_response.split(" ")
            for i, word in enumerate(words):
                space = " " if i > 0 else ""
                yield f"data: {json.dumps({'token': space + word})}\n\n"
                await asyncio.sleep(0.03)

            # Yield tool outputs and metadata at the very end
            yield f"data: {json.dumps({
                'done': True,
                'tool_used': result.get('tool_used'),
                'tool_output': result.get('tool_output'),
                'is_web_augmented': result.get('is_web_augmented', False)
            })}\n\n"
            
        except Exception as e:
            logger.exception("Error in chat stream:")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/graph-data/{session_id}", response_model=GraphDataResponse, tags=["graph"])
async def graph_data(
    request: Request,
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
) -> GraphDataResponse:
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

    # Log successful graph access to audit trail
    log_event(
        AUDIT_GRAPH_ACCESS,
        user_id=user.clerk_id,
        session_id=session_id,
        ip_address=get_client_ip(request),
    )

    layout_json = None
    if nb_row and "graph_layout_json" in nb_row.keys():
        layout_json = nb_row["graph_layout_json"]

    try:
        data = build_reactflow_data(session_id, layout_json=layout_json)
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


@app.get("/api/notebooks/{session_id}/graph-rag", tags=["graph"])
async def get_graph_rag_data(session_id: str, user: ClerkUser = Depends(get_current_user)):
    """
    Retrieve GraphRAG entity nodes and relationship edges persisted in SQLite
    for rendering in our Three.js WebGL 3D Concept Galaxy.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    from engine.graph_store import get_graph_data
    try:
        data = get_graph_data(session_id)
        return data
    except Exception as exc:
        logger.exception("Failed to fetch graph data for session %s:", session_id)
        raise HTTPException(status_code=500, detail=str(exc))


@app.websocket("/api/notebooks/{session_id}/podcast/live")
async def live_podcast_websocket(
    websocket: WebSocket,
    session_id: str
):
    """
    Bidirectional WebSocket connection proxying raw browser microphone audio PCM chunks
    directly to the Gemini Multimodal Live API (gemini-2.0-flash-exp) and streaming
    dynamic co-host audio PCM back.
    """
    await websocket.accept()
    logger.info("Live podcast WebSocket connection established for session: %s", session_id)
    
    token = websocket.query_params.get("token")
    user_id = None
    
    if os.getenv("ACUMEN_AUTH_BYPASS", "false").lower() == "true":
        user_id = "dev_user"
    elif token:
        try:
            from engine.auth import _verify_token
            claims = await _verify_token(token)
            user_id = claims.get("sub")
        except Exception as auth_err:
            logger.warning("WebSocket token verification failed: %s", auth_err)
            await websocket.close(code=4003)
            return
            
    if not user_id:
        logger.warning("Unauthenticated WebSocket access attempt.")
        await websocket.close(code=4003)
        return
        
    row = db.get_notebook(session_id)
    if row and row["clerk_id"] and row["clerk_id"] != user_id:
        logger.warning("Unauthorised WebSocket access for user: %s", user_id)
        await websocket.close(code=4003)
        return

    try:
        from google import genai
        from google.genai import types
        
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            logger.error("GOOGLE_API_KEY is not set.")
            await websocket.close(code=4001)
            return
            
        client = genai.Client(api_key=api_key, http_options={'api_version': 'v1alpha'})
        
        # Compile session document context to feed the hosts' instructions
        try:
            clusters = get_session(session_id)
            context_str = ""
            for cid, chunks in clusters.items():
                context_str += f"\nTopic Cluster {cid}:\n" + "\n".join(chunks[:1])
        except Exception:
            context_str = "A technical research project."

        system_instruction = (
            "You are Host A (warm female co-host named Aoede) and Host B (casual male co-host named Puck), hosting a live interactive podcast overview.\n"
            "Here is the context project content summaries:\n"
            f"{context_str[:6000]}\n\n"
            "You are speaking in a continuous live dialogue turn. Respond dynamically to the user (Host C) who will join the conversation live at the desk via mic.\n"
            "Aoede focuses on precise tech stack details; Puck explains with playful, short analogies.\n"
            "Speak naturally and keep your responses short, conversational, and energetic."
        )

        config = types.LiveConnectConfig(
            response_modalities=[types.LiveModality.AUDIO],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
            system_instruction=types.Content(parts=[types.Part.from_text(system_instruction)])
        )
        
        # Open persistent Live WebSocket connection to Gemini 2.0 Multimodal Live API
        async with client.aio.live.connect(model="gemini-2.0-flash-exp", config=config) as session:
            logger.info("Persistent Gemini Live Multimodal WebSocket session established.")
            
            async def forward_user_mic():
                try:
                    while True:
                        data = await websocket.receive_bytes()
                        await session.send(input={"data": data, "mime_type": "audio/pcm;rate=16000"})
                except WebSocketDisconnect:
                    pass
                except Exception as forward_err:
                    logger.error("Error forwarding user mic bytes: %s", forward_err)
                    
            async def forward_gemini_audio():
                try:
                    async for response in session.receive():
                        server_content = response.server_content
                        if server_content and server_content.model_turn:
                            for part in server_content.model_turn.parts:
                                if part.inline_data:
                                    await websocket.send_bytes(part.inline_data.data)
                except WebSocketDisconnect:
                    pass
                except Exception as recv_err:
                    logger.error("Error forwarding Gemini live audio bytes: %s", recv_err)
            
            await asyncio.gather(forward_user_mic(), forward_gemini_audio())
            
    except WebSocketDisconnect:
        logger.info("Live podcast WebSocket disconnected for session: %s", session_id)
    except Exception as exc:
        logger.exception("Gemini Multimodal Live proxy gateway crashed:")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


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
        script = await generate_audio_script(session_id)
        return {"script": script}
    except Exception as exc:
        logger.exception("Audio script generation failed for session %s.", session_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class PodcastJoinRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = []


@app.post("/api/notebooks/{session_id}/podcast/join", tags=["audio"])
async def join_podcast_conversation(
    session_id: str,
    req: PodcastJoinRequest,
    user: ClerkUser = Depends(get_current_user)
):
    """
    Simulated Live Join Conversation turn.
    Accepts user question (as Host C) and returns Host A & B responses in script style.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from langchain_core.messages import HumanMessage
        from langchain_google_genai import ChatGoogleGenerativeAI
        
        # Compile session context
        clusters = get_session(session_id)
        context_str = ""
        for cid, chunks in clusters.items():
            context_str += f"\nTopic Cluster {cid}:\n" + "\n".join(chunks[:2])
            
        history_str = ""
        for line in req.history:
            history_str += f"Host {line.get('host', 'C')}: {line.get('text', '')}\n"

        prompt = (
            "You are Host A (technical AI Explainer) and Host B (warm Analogy Specialist), co-hosting a live interactive podcast.\n"
            "Here is the context document summaries:\n"
            f"{context_str[:8000]}\n\n"
            "Here is the dialogue history so far:\n"
            f"{history_str}\n\n"
            f"Host C (the user) joins the conversation live at the desk and says: '{req.message}'\n\n"
            "Now, respond in character directly to Host C. Continue the interactive podcast dialogue naturally.\n"
            "Keep the responses technical, concise, and professional.\n"
            "Host A should address technical architecture, Host B should add a clear intuitive analogy.\n"
            "Provide exactly 1 line from Host A and 1 line from Host B responding to their question.\n"
            "Respond ONLY with a JSON array:\n"
            '[{"host": "A", "text": "Explainer response"}, {"host": "B", "text": "Analogy response"}]'
        )

        from engine.fallback_chain import invoke_llm_with_fallback
        
        resp = await invoke_llm_with_fallback(
            [HumanMessage(content=prompt)],
            temperature=0.5,
            max_tokens=512,
            structured_json=True
        )
        
        # Extract and parse JSON
        from engine.wiki_swarm import _extract_json_block
        raw = _extract_json_block(resp.content)
        lines = json.loads(raw)
        
        # Premium Upgrade: Dynamic Voice Synthesis (v3.2)
        import base64
        from google import genai
        from engine.audio_generator import synthesize_line_gemini, HAS_GENAI_SDK
        
        output_payload = []
        api_key = os.getenv("GOOGLE_API_KEY")
        
        if HAS_GENAI_SDK and api_key:
            try:
                client = genai.Client(api_key=api_key)
                for line in lines:
                    host = line.get("host", "A").upper()
                    text = line.get("text", "")
                    voice_name = "Aoede" if host == "A" else "Puck"
                    
                    logger.info("Live Join desk synthesizing audio for Host %s...", host)
                    audio_bytes = await synthesize_line_gemini(client, text, voice_name)
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                    
                    output_payload.append({
                        "host": host,
                        "text": text,
                        "audio": f"data:audio/wav;base64,{audio_b64}"
                    })
            except Exception as tts_err:
                logger.error("Failed to synthesize dynamic voice response: %s", tts_err)
                # Fallback to text-only if TTS fails
                output_payload = [{"host": line.get("host", "A"), "text": line.get("text", ""), "audio": None} for line in lines]
        else:
            output_payload = [{"host": line.get("host", "A"), "text": line.get("text", ""), "audio": None} for line in lines]
            
        return {"response": output_payload}
    except Exception as exc:
        logger.exception("Podcast Live Join failed:")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/generate-audio/{session_id}", tags=["audio"])
async def generate_audio(session_id: str, user: ClerkUser = Depends(get_current_user)):
    """
    Generate a premium dual-host TTS audio overview based on the 
    notebook's synthesized text, and return the .wav file.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        # 1. Generate the conversational podcast dialogue script
        script = await generate_audio_script(session_id)
        
        # 2. Synthesize the dual-host audio conversation
        file_path = await generate_podcast_audio(script, session_id)
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
    notebooks = []
    for r in rows:
        history = []
        try:
            # history_json column might be missing if migration hasn't run yet
            if "history_json" in r.keys() and r["history_json"]:
                history = json.loads(r["history_json"])
        except Exception:
            pass
            
        notebooks.append(NotebookSummary(
            id=r["id"],
            title=r["title"],
            status=r["status"],
            created_at=r["created_at"],
            source_type=r["source_type"] if "source_type" in r.keys() else "pdf",
            history=history
        ))
    return NotebooksResponse(notebooks=notebooks)


@app.delete("/api/notebooks/{session_id}", tags=["user"])
async def delete_notebook(session_id: str, user: ClerkUser = Depends(get_current_user)):
    """
    Delete a specific notebook, its database record, and its ChromaDB records.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Delete from SQLite
    with db._connect() as conn:
        conn.execute("DELETE FROM notebooks WHERE session_id = ?", (session_id,))
        conn.commit()

    # Delete from ChromaDB
    try:
        from engine.wiki_swarm import get_wiki_collection
        collection = get_wiki_collection()
        # Fetch all ids belonging to this session
        results = collection.get(where={"session_id": session_id}, include=[])
        if results and results.get("ids"):
            collection.delete(ids=results["ids"])
            logger.info("Deleted %d ChromaDB docs for session %s.", len(results["ids"]), session_id)
    except Exception as exc:
        logger.error("Failed to delete ChromaDB docs for session %s: %s", session_id, exc)

    # Evict from in-memory cache
    if session_id in _sessions:
        del _sessions[session_id]

    return {"status": "success", "message": f"Notebook '{session_id}' successfully deleted."}


@app.patch("/api/notebooks/{session_id}", tags=["user"])
async def rename_notebook(
    session_id: str,
    payload: Dict[str, str],
    user: ClerkUser = Depends(get_current_user)
):
    """
    Rename a specific notebook.
    """
    title = payload.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Title field is required.")

    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    with db._connect() as conn:
        conn.execute("UPDATE notebooks SET title = ? WHERE session_id = ?", (title, session_id))
        conn.commit()

    return {"status": "success", "message": f"Notebook successfully renamed to '{title}'."}


@app.get("/api/notebooks/{session_id}/notes", tags=["user"])
async def get_notebook_notes(session_id: str, user: ClerkUser = Depends(get_current_user)):
    """
    Get persistent notes, snippets, and links for a specific notebook.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        notes = json.loads(row["notes_json"] or "{}")
    except Exception:
        notes = {}

    try:
        snippets = json.loads(row["snippets_json"] or "[]")
    except Exception:
        snippets = []

    try:
        links = json.loads(row["links_json"] or "[]")
    except Exception:
        links = []

    return {
        "notes": notes,
        "snippets": snippets,
        "links": links
    }


@app.patch("/api/notebooks/{session_id}/notes", tags=["user"])
async def update_notebook_notes(
    session_id: str,
    payload: Dict[str, Any],
    user: ClerkUser = Depends(get_current_user)
):
    """
    Update persistent notes, snippets, or links for a specific notebook.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    if "notes" in payload:
        db.update_notes(session_id, payload["notes"])
    if "snippets" in payload:
        db.update_snippets(session_id, payload["snippets"])
    if "links" in payload:
        db.update_links(session_id, payload["links"])

    return {"status": "success", "message": "Notebook persistent workspace updated successfully."}


@app.get("/api/notebooks/{session_id}/graph-layout", tags=["graph"])
async def get_notebook_graph_layout(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Retrieve saved node coordinate configurations."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        layout = json.loads(row["graph_layout_json"] or "{}")
    except Exception:
        layout = {}
    return {"layout": layout}


@app.patch("/api/notebooks/{session_id}/graph-layout", tags=["graph"])
async def update_notebook_graph_layout(
    session_id: str,
    payload: Dict[str, Any],
    user: ClerkUser = Depends(get_current_user)
):
    """Save persistent dragged node layout coordinates."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    layout = payload.get("layout")
    if layout is None:
        raise HTTPException(status_code=400, detail="Layout payload is missing.")

    db.update_graph_layout(session_id, layout)
    return {"status": "success", "message": "Graph layout saved successfully."}


@app.post("/api/notebooks/{session_id}/history", tags=["user"])
async def update_notebook_history(
    session_id: str,
    history: List[HistoryItem],
    user: ClerkUser = Depends(get_current_user)
):
    """
    Update the chat history for a specific notebook.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db.update_history(session_id, [h.model_dump() for h in history])
    return {"status": "success"}


# ==============================================================================
# PHASE 3 ENDPOINTS: Source Management, Artifact Studio, Sharing, & Flashcards
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Source Management Panel (P3.3)
# ------------------------------------------------------------------------------

@app.get("/api/notebooks/{session_id}/sources", tags=["sources"])
async def get_notebook_sources(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """List all individual sources ingested within a notebook."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        sources = json.loads(row["sources_json"] or "[]")
    except Exception:
        sources = []
    return {"sources": sources}


@app.delete("/api/notebooks/{session_id}/sources/{source_id}", tags=["sources"])
async def delete_notebook_source(
    session_id: str,
    source_id: str,
    background_tasks: BackgroundTasks,
    user: ClerkUser = Depends(get_current_user)
):
    """
    Delete a specific source, its text chunks in ChromaDB, and update 
    the notebook clusters and wiki summaries reactively in the background.
    """
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        sources = json.loads(row["sources_json"] or "[]")
    except Exception:
        sources = []

    # Filter out the deleted source metadata
    updated_sources = [s for s in sources if s.get("source_id") != source_id]
    db.update_sources(session_id, updated_sources)

    # 1. Delete matching text chunks from ChromaDB in the background
    def clean_chroma_source_chunks():
        try:
            from engine.ingest_v2 import get_chunks_collection
            chunks_col = get_chunks_collection()
            res = chunks_col.get(where={"source_id": source_id}, include=[])
            if res and res.get("ids"):
                chunks_col.delete(ids=res["ids"])
                logger.info("Deleted %d ChromaDB chunks for source %s", len(res["ids"]), source_id)
        except Exception as exc:
            logger.error("Failed to delete ChromaDB chunks for source %s: %s", source_id, exc)

    background_tasks.add_task(clean_chroma_source_chunks)

    # 2. Trigger reactive re-clustering and re-synthesis in the background
    async def reprocess_remaining_sources():
        try:
            db.update_status(session_id, "synthesizing")
            from engine.ingest_v2 import get_chunks_collection
            from engine.wiki_swarm import run_wiki_swarm
            import numpy as np
            from sklearn.cluster import KMeans
            from sklearn.preprocessing import normalize
            from engine.embedder import get_document_embedder
            
            chunks_col = get_chunks_collection()
            res = chunks_col.get(where={"session_id": session_id, "raptor_level": 0}, include=["documents"])
            leaf_texts = res.get("documents", [])
            
            if not leaf_texts:
                # No sources left, empty clusters and status
                db.save_notebook(session_id, row["title"], {}, user.clerk_id, source_type=row["source_type"])
                db.update_status(session_id, "completed")
                # Clear wiki pages
                from engine.wiki_swarm import get_wiki_collection
                wiki_col = get_wiki_collection()
                wiki_res = wiki_col.get(where={"session_id": session_id}, include=[])
                if wiki_res and wiki_res.get("ids"):
                    wiki_col.delete(ids=wiki_res["ids"])
                return

            n_kmeans_clusters = min(5, len(leaf_texts))
            if len(leaf_texts) < n_kmeans_clusters:
                legacy_clusters = {0: leaf_texts}
            else:
                embedder = get_document_embedder()
                leaf_embeddings = await embedder.aembed_documents(leaf_texts)
                leaf_embeddings_norm = normalize(np.array(leaf_embeddings, dtype=np.float32), norm="l2")
                
                kmeans = KMeans(n_clusters=n_kmeans_clusters, random_state=42, n_init="auto")
                labels = kmeans.fit_predict(leaf_embeddings_norm)
                
                legacy_clusters = {i: [] for i in range(n_kmeans_clusters)}
                for chunk, label in zip(leaf_texts, labels.tolist()):
                    legacy_clusters[int(label)].append(chunk)
            
            db.save_notebook(session_id, row["title"], legacy_clusters, user.clerk_id, source_type=row["source_type"])
            
            # Clear old wiki pages and re-synthesis
            from engine.wiki_swarm import get_wiki_collection
            wiki_col = get_wiki_collection()
            wiki_res = wiki_col.get(where={"session_id": session_id}, include=[])
            if wiki_res and wiki_res.get("ids"):
                wiki_col.delete(ids=wiki_res["ids"])
                
            await run_wiki_swarm(session_id=session_id, clusters=legacy_clusters)
            db.update_status(session_id, "completed")
            logger.info("Reactive re-synthesis completed after deleting source %s", source_id)
        except Exception as e:
            logger.exception("Reactive source deletion re-synthesis failed: %s", e)
            db.update_status(session_id, "error")

    background_tasks.add_task(reprocess_remaining_sources)
    return {"status": "success", "message": f"Source '{source_id}' deletion enqueued."}


# ------------------------------------------------------------------------------
# 2. Artifact Studio Panel (P3.2)
# ------------------------------------------------------------------------------

@app.get("/generate-faq/{session_id}", tags=["artifacts"])
async def get_faq_artifact(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Generate FAQ Study Guide document."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from engine.artifact_generator import generate_faq
        content = await generate_faq(session_id)
        return {"faq": content}
    except Exception as exc:
        logger.exception("FAQ generation failed for session %s: %s", session_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/generate-study-guide/{session_id}", tags=["artifacts"])
async def get_study_guide_artifact(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Generate premium academic Study Guide."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from engine.artifact_generator import generate_study_guide
        content = await generate_study_guide(session_id)
        return {"study_guide": content}
    except Exception as exc:
        logger.exception("Study Guide generation failed for session %s: %s", session_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/generate-briefing/{session_id}", tags=["artifacts"])
async def get_briefing_artifact(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Generate strategic Executive Briefing Document."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from engine.artifact_generator import generate_briefing
        content = await generate_briefing(session_id)
        return {"briefing": content}
    except Exception as exc:
        logger.exception("Briefing generation failed for session %s: %s", session_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/generate-timeline/{session_id}", tags=["artifacts"])
async def get_timeline_artifact(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Generate chronological event Timeline."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from engine.artifact_generator import generate_timeline
        content = await generate_timeline(session_id)
        return {"timeline": content}
    except Exception as exc:
        logger.exception("Timeline generation failed for session %s: %s", session_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/generate-mindmap/{session_id}", tags=["artifacts"])
async def get_mindmap_artifact(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Generate structural JSON Mindmap for reactive node maps."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from engine.artifact_generator import generate_mindmap
        content = await generate_mindmap(session_id)
        return {"mindmap": content}
    except Exception as exc:
        logger.exception("Mindmap generation failed for session %s: %s", session_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/notebooks/{session_id}/export", tags=["artifacts"])
async def export_notebook_pack(
    session_id: str,
    background_tasks: BackgroundTasks,
    user: ClerkUser = Depends(get_current_user)
):
    """Compile all notes, outlines, FAQs, study guides, timelines, and mindmaps into a single ZIP file."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    import zipfile
    import time
    
    temp_dir = os.path.join(DATA_DIR, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    zip_path = os.path.join(temp_dir, f"acumen_export_{session_id}.zip")
    
    try:
        from engine.artifact_generator import (
            generate_faq, generate_study_guide, generate_briefing, generate_timeline, generate_mindmap
        )
        
        # Compile all artifacts synchronously (or run parallel if needed)
        faq_md = await generate_faq(session_id)
        study_guide_md = await generate_study_guide(session_id)
        briefing_md = await generate_briefing(session_id)
        timeline_md = await generate_timeline(session_id)
        mindmap_json = await generate_mindmap(session_id)
        
        # User notes
        notes_dict = json.loads(row["notes_json"] or "{}")
        notes_md = "# Acumen Persistent User Notes\n\n"
        if notes_dict:
            for cluster_id, text in notes_dict.items():
                notes_md += f"## Topic Cluster {cluster_id}\n{text}\n\n"
        else:
            notes_md += "*No persistent notes saved for this notebook yet.*"
            
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            readme = f"# ACUMEN Research Pack\n\nNotebook Title: {row['title']}\nExported: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n"
            zip_file.writestr("README.md", readme)
            zip_file.writestr("FAQ.md", faq_md)
            zip_file.writestr("Study_Guide.md", study_guide_md)
            zip_file.writestr("Executive_Briefing.md", briefing_md)
            zip_file.writestr("Timeline.md", timeline_md)
            zip_file.writestr("User_Notes.md", notes_md)
            zip_file.writestr("Mindmap.json", json.dumps(mindmap_json, indent=2))
            zip_file.writestr("Wiki_Pages_Raw.json", row["clusters_json"] or "{}")
            
        def clean_temp_zip():
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except Exception:
                pass
                
        background_tasks.add_task(clean_temp_zip)
        return FileResponse(path=zip_path, media_type="application/zip", filename=f"acumen_research_pack_{session_id}.zip")
        
    except Exception as e:
        logger.exception("Failed to generate export ZIP for %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail=f"Export generation failed: {str(e)}")


# ------------------------------------------------------------------------------
# 3. Persistent Flashcards Progress (P3.4)
# ------------------------------------------------------------------------------

@app.get("/api/notebooks/{session_id}/flashcard-progress", tags=["flashcards"])
async def get_flashcard_progress(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Retrieve flashcard known/review states."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        progress = json.loads(row["flashcard_progress_json"] or "{}")
    except Exception:
        progress = {}
    return {"progress": progress}


@app.patch("/api/notebooks/{session_id}/flashcard-progress", tags=["flashcards"])
async def update_flashcard_progress(
    session_id: str,
    payload: Dict[str, Any],
    user: ClerkUser = Depends(get_current_user)
):
    """Save flashcard known/review states permanently."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    progress = payload.get("progress")
    if progress is None:
        raise HTTPException(status_code=400, detail="Progress payload missing")

    db.update_flashcard_progress(session_id, progress)
    return {"status": "success", "message": "Flashcard progress successfully persistent."}


# ------------------------------------------------------------------------------
# 4. Notebook Secure Sharing (P3.5)
# ------------------------------------------------------------------------------

@app.post("/api/notebooks/{session_id}/share", tags=["sharing"])
async def create_share_link(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Generate a cryptographically secure token enabling read-only access."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    token = str(uuid.uuid4())
    db.update_share_token(session_id, token)
    return {"share_link": f"/share/{token}", "token": token}


@app.delete("/api/notebooks/{session_id}/share", tags=["sharing"])
async def revoke_share_link(
    session_id: str,
    user: ClerkUser = Depends(get_current_user)
):
    """Revoke sharing capabilities instantly, resetting the token."""
    row = db.get_notebook(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notebook not found")
    if row["clerk_id"] and row["clerk_id"] != user.clerk_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    db.update_share_token(session_id, None)
    return {"status": "success", "message": "Share link successfully revoked."}


@app.get("/api/share/{token}", tags=["sharing"])
async def get_shared_notebook(token: str):
    """Securely fetch and read a shared notebook payload without authentication checks."""
    with db._connect() as conn:
        row = conn.execute(
            "SELECT * FROM notebooks WHERE share_token = ?", (token,)
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Shared notebook not found or share link has been revoked.")

    session_id = row["session_id"]
    
    # Compile wiki pages for read-only view
    from engine.wiki_swarm import get_wiki_collection
    try:
        wiki_col = get_wiki_collection()
        wiki_res = wiki_col.get(where={"session_id": session_id})
        wiki_pages = []
        if wiki_res and wiki_res.get("documents"):
            for doc in wiki_res["documents"]:
                try:
                    wiki_pages.append(json.loads(doc))
                except Exception:
                    pass
    except Exception:
        wiki_pages = []

    # Compile user notes
    try:
        notes = json.loads(row["notes_json"] or "{}")
    except Exception:
        notes = {}

    return {
        "title": row["title"],
        "session_id": session_id,
        "created_at": row["created_at"],
        "source_type": row["source_type"],
        "wiki_pages": wiki_pages,
        "notes": notes
    }
