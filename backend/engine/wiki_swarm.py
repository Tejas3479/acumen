"""
Acumen — Synthesizer Swarm (LangGraph)
========================================
Karpathy Wiki Pattern: Step 2

LangGraph state graph:
  [synthesize_wiki_pages] → [store_wiki_page] → router ─┐
          ↑_______________________________________________|  (loop)
                                                         └→ [END]

For each KMeans cluster:
  1. Feed all chunks to an LLM with a synthesis prompt.
  2. LLM returns: { topic_title, summary, key_terms, insights }
  3. Stored in ChromaDB `acumen_wiki` with metadata:
       { session_id, cluster_id, topic_name, summary }
"""

from __future__ import annotations

import json
import logging
import math
import os
import traceback
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.api.types import Documents, Embeddings, EmbeddingFunction
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field
import time
from typing_extensions import TypedDict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ChromaDB singleton — persistent on disk at ./chroma_db
# ---------------------------------------------------------------------------

CHROMA_PERSIST_PATH: str = os.environ.get("ACUMEN_CHROMA_PATH", "./chroma_db")
CHROMA_COLLECTION_NAME = "acumen_wiki"

_chroma_client: Optional[chromadb.PersistentClient] = None
_wiki_collection: Optional[chromadb.Collection] = None


class GeminiEmbeddingFunction(EmbeddingFunction):
    """Wrapper to make LangChain embeddings compatible with ChromaDB."""
    def __init__(self, model_name: str = "models/gemini-embedding-001"):
        self.embedder = GoogleGenerativeAIEmbeddings(model=model_name)
    def __call__(self, input: Documents) -> Embeddings:
        # Cast to list of strings for LangChain
        return self.embedder.embed_documents(list(input))
    def name(self) -> str:
        return "GeminiEmbeddingFunction"

def get_wiki_collection() -> chromadb.Collection:
    """Return (and lazily create) the persistent `acumen_wiki` ChromaDB collection.

    Data is stored on disk at CHROMA_PERSIST_PATH so the collection survives
    backend restarts.
    """
    global _chroma_client, _wiki_collection
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_PATH)
        logger.info("ChromaDB PersistentClient initialised at '%s'.", CHROMA_PERSIST_PATH)
    if _wiki_collection is None:
        # Step 1: Initialize the explicit embedding function
        embedding_fn = GeminiEmbeddingFunction(model_name="models/gemini-embedding-001")
        
        _wiki_collection = _chroma_client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
            embedding_function=embedding_fn,
        )
        logger.info("ChromaDB collection '%s' ready with Gemini gemini-embedding-001.", CHROMA_COLLECTION_NAME)
    return _wiki_collection


# ---------------------------------------------------------------------------
# Pydantic schema for a single Wiki Page
# ---------------------------------------------------------------------------

class WikiPage(BaseModel):
    cluster_id: int
    topic_title: str = Field(description="A concise, descriptive title for this topic cluster.")
    summary: str = Field(description="A cohesive 2-4 sentence summary of the cluster's content.")
    key_terms: List[str] = Field(description="5-8 important terms or concepts from this cluster.")
    insights: List[str] = Field(description="3-5 key insights or takeaways from this cluster.")


# ---------------------------------------------------------------------------
# LangGraph state
# ---------------------------------------------------------------------------

class SwarmState(TypedDict):
    session_id: str
    clusters: Dict[int, List[str]]
    cluster_ids: List[int]
    current_index: int
    wiki_pages: List[Dict[str, Any]]
    errors: List[str]


# ---------------------------------------------------------------------------
# LLM synthesis helper
# ---------------------------------------------------------------------------

SYNTHESIS_SYSTEM_PROMPT = """\
You are an expert knowledge synthesizer. Read the raw text fragments from a document \
and write a cohesive, structured Wiki Page.

Respond with ONLY valid JSON — no markdown fences:
{
  "topic_title": "concise title for this topic",
  "summary": "2-4 sentence cohesive summary",
  "key_terms": ["term1", "term2", ...],
  "insights": ["insight1", "insight2", ...]
}

key_terms: 5-8 important concepts.
insights: 3-5 concrete takeaways."""


def _extract_json_block(text: Any) -> str:
    """Helper to extract JSON from LLM response strings or blocks."""
    if isinstance(text, list):
        raw = " ".join([item.get("text", "") for item in text if isinstance(item, dict) and "text" in item])
    else:
        raw = str(text)
    
    raw = raw.strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        return raw[start:end+1]
    return raw

def _synthesize_cluster(cluster_id: int, chunks: List[str]) -> WikiPage:
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.3, max_tokens=1024)

    # Step 2: Context Window Management (15,000 chars)
    combined = "\n\n---\n\n".join(chunks)
    if len(combined) > 15000:
        logger.info("Cluster %d text exceeds 15k chars, truncating...", cluster_id)
        combined = combined[:15000] + "\n\n[truncated for context window]"

    # Step 1: Retry Logic
    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            messages = [
                SystemMessage(content=SYNTHESIS_SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"Cluster {cluster_id} fragments:\n\n{combined}\n\n"
                        "Write the Wiki Page JSON now."
                    )
                ),
            ]
            resp = llm.invoke(messages)
            raw = _extract_json_block(resp.content)

            try:
                data = json.loads(raw)
                return WikiPage(cluster_id=cluster_id, **data)
            except json.JSONDecodeError:
                # Step 3: Fallback Formatting (Self-Correction)
                logger.warning("Cluster %d: Invalid JSON, attempting self-correction (Attempt %d)", cluster_id, attempt + 1)
                correction_prompt = (
                    f"The following was not valid JSON. Please fix it strictly following the schema: "
                    f"{{'topic_title': '...', 'summary': '...', 'key_terms': [...], 'insights': [...]}}.\n\n"
                    f"Malformed output: {raw}"
                )
                resp = llm.invoke([HumanMessage(content=correction_prompt)])
                raw = _extract_json_block(resp.content)
                data = json.loads(raw)
                return WikiPage(cluster_id=cluster_id, **data)

        except Exception as e:
            last_error = e
            logger.warning("Cluster %d: Synthesis attempt %d failed: %s", cluster_id, attempt + 1, e)
            if attempt < max_retries - 1:
                time.sleep(2) # Step 1: Wait 2 seconds
            continue

    # Step 3: Final Fallback (Derived from first 5 words)
    logger.error("Cluster %d: All synthesis attempts failed. Using final fallback.", cluster_id)
    words = combined.split()
    fallback_title = " ".join(words[:5]) + "..." if len(words) > 5 else f"Topic {cluster_id}"
    
    return WikiPage(
        cluster_id=cluster_id,
        topic_title=fallback_title,
        summary="Synthesis failed for this cluster after multiple attempts. Manual review recommended.",
        key_terms=[],
        insights=[]
    )


# ---------------------------------------------------------------------------
# LangGraph node: synthesize_wiki_pages
# ---------------------------------------------------------------------------

def synthesize_wiki_pages(state: SwarmState) -> SwarmState:
    """Synthesize the current cluster into a structured Wiki Page via LLM."""
    idx = state["current_index"]
    cluster_id = state["cluster_ids"][idx]
    chunks = state["clusters"][cluster_id]
    session_id = state["session_id"]

    # Step 4: Persistence Update / Check
    # If the node already exists in ChromaDB, we skip synthesis to avoid redundant LLM calls
    # and ensure failures don't keep repeating if the user refreshes.
    collection = get_wiki_collection()
    doc_id = f"{session_id}_cluster_{cluster_id}"
    
    try:
        existing = collection.get(ids=[doc_id])
        if existing and existing.get("ids"):
            logger.info("Cluster %d already synthesized for session %s. Skipping.", cluster_id, session_id)
            # Reconstruct the page dict from metadata
            meta = existing["metadatas"][0]
            wiki_page_dict = {
                "cluster_id": cluster_id,
                "topic_title": meta.get("topic_name", ""),
                "summary": meta.get("summary", ""),
                "key_terms": json.loads(meta.get("key_terms_json", "[]")),
                "insights": json.loads(meta.get("insights_json", "[]")),
            }
            return {**state, "wiki_pages": state["wiki_pages"] + [wiki_page_dict]}
    except Exception as e:
        logger.warning("Failed to check ChromaDB for existing cluster %d: %s", cluster_id, e)

    logger.info(
        "Synthesizing cluster %d (%d chunks) [%d/%d] …",
        cluster_id, len(chunks), idx + 1, len(state["cluster_ids"]),
    )

    # Synthesis with retry and fallbacks
    wiki_page = _synthesize_cluster(cluster_id, chunks)
    updated_pages = state["wiki_pages"] + [wiki_page.model_dump()]
    logger.info("  → Topic: '%s'", wiki_page.topic_title)
    return {**state, "wiki_pages": updated_pages}


# ---------------------------------------------------------------------------
# LangGraph node: store_wiki_page
# ---------------------------------------------------------------------------

def store_wiki_page(state: SwarmState) -> SwarmState:
    """
    Persist the latest WikiPage into ChromaDB acumen_wiki.

    Metadata stored per document:
      - session_id   → for per-session filtering
      - cluster_id   → numeric cluster label
      - topic_name   → human-readable topic title (spec requirement)
      - summary      → the 2-4 sentence summary (spec requirement)
    """
    latest: Dict[str, Any] = state["wiki_pages"][-1]
    cluster_id = latest["cluster_id"]
    collection = get_wiki_collection()

    doc_text = (
        f"# {latest['topic_title']}\n\n"
        f"## Summary\n{latest['summary']}\n\n"
        f"## Key Terms\n" + ", ".join(latest["key_terms"]) + "\n\n"
        "## Insights\n" + "\n".join(f"- {i}" for i in latest["insights"])
    )

    doc_id = f"{state['session_id']}_cluster_{cluster_id}"

    collection.upsert(
        ids=[doc_id],
        documents=[doc_text],
        metadatas=[
            {
                "session_id": state["session_id"],
                "cluster_id": cluster_id,
                "topic_name": latest["topic_title"],   # spec: Topic Name
                "summary": latest["summary"],           # spec: Summary
                "key_terms_json": json.dumps(latest["key_terms"]),
                "insights_json": json.dumps(latest["insights"]),
            }
        ],
    )
    logger.info("  ✔ Stored '%s' → ChromaDB (id=%s)", latest["topic_title"], doc_id)

    return {**state, "current_index": state["current_index"] + 1}


# ---------------------------------------------------------------------------
# Router — loop or END
# ---------------------------------------------------------------------------

def router(state: SwarmState) -> str:
    if state["current_index"] < len(state["cluster_ids"]):
        return "synthesize_wiki_pages"
    return END


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

_compiled_graph = None


def _build_graph():
    g = StateGraph(SwarmState)
    g.add_node("synthesize_wiki_pages", synthesize_wiki_pages)
    g.add_node("store_wiki_page", store_wiki_page)
    g.set_entry_point("synthesize_wiki_pages")
    g.add_edge("synthesize_wiki_pages", "store_wiki_page")
    g.add_conditional_edges(
        "store_wiki_page",
        router,
        {"synthesize_wiki_pages": "synthesize_wiki_pages", END: END},
    )
    return g.compile()


def get_graph():
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = _build_graph()
    return _compiled_graph


# ---------------------------------------------------------------------------
# Public entry point: run_wiki_swarm
# ---------------------------------------------------------------------------

def run_wiki_swarm(
    session_id: str,
    clusters: Dict[int, List[str]],
) -> List[Dict[str, Any]]:
    """
    Run the LangGraph Synthesizer Swarm.

    Args:
        session_id: UUID from /upload.
        clusters:   { cluster_id: [chunk_texts] } from ingest_pdf().

    Returns:
        List of WikiPage dicts — also persisted in ChromaDB acumen_wiki.
    """
    logger.info("=== Wiki Swarm START (session=%s, %d clusters) ===", session_id, len(clusters))

    initial: SwarmState = {
        "session_id": session_id,
        "clusters": clusters,
        "cluster_ids": sorted(clusters.keys()),
        "current_index": 0,
        "wiki_pages": [],
        "errors": [],
    }

    final = get_graph().invoke(initial)

    pages = final["wiki_pages"]
    if final.get("errors"):
        logger.warning("Swarm errors: %s", final["errors"])
    logger.info("=== Wiki Swarm COMPLETE — %d pages stored ===", len(pages))
    return pages


# ---------------------------------------------------------------------------
# ReactFlow graph-data helper
# ---------------------------------------------------------------------------

def build_reactflow_data(session_id: str) -> Dict[str, Any]:
    """
    Query ChromaDB for all wiki pages belonging to this session and
    return a ReactFlow-compatible payload:

      {
        "nodes": [ { id, type, position, data } … ],
        "edges": [ { id, source, target, label, animated } … ]
      }

    Node positions are arranged in a circle.
    Edges are generated by an LLM call (1-2 topic relationships).
    """
    collection = get_wiki_collection()

    # Fetch all documents for this session
    results = collection.get(
        where={"session_id": session_id},
        include=["metadatas", "documents"],
    )

    metadatas: List[Dict] = results.get("metadatas") or []
    documents: List[str] = results.get("documents") or []

    if not metadatas:
        return {"nodes": [], "edges": []}

    n = len(metadatas)

    # --- Build nodes in a circle layout ---
    radius = 320
    cx, cy = 450, 350
    nodes = []
    for i, (meta, doc) in enumerate(zip(metadatas, documents)):
        angle = (2 * math.pi * i) / n
        x = round(cx + radius * math.cos(angle), 1)
        y = round(cy + radius * math.sin(angle), 1)

        cid = meta.get("cluster_id", i)
        nodes.append({
            "id": f"cluster_{cid}",
            "type": "topicNode",           # custom node type on frontend
            "position": {"x": x, "y": y},
            "data": {
                "label": meta.get("topic_name", f"Topic {cid}"),
                "summary": meta.get("summary", ""),
                "cluster_id": cid,
                "key_terms": json.loads(meta.get("key_terms_json", "[]")),
                "insights": json.loads(meta.get("insights_json", "[]")),
            },
        })

    # --- Ask LLM to define 1-2 relationships between topics ---
    topic_list = "\n".join(
        f"- cluster_{m.get('cluster_id', i)}: {m.get('topic_name', '')}"
        for i, m in enumerate(metadatas)
    )

    edge_prompt = (
        "Given these document topic nodes:\n"
        f"{topic_list}\n\n"
        "Define 2 meaningful conceptual relationships (edges) between them.\n"
        "Respond with ONLY a JSON array — no markdown:\n"
        '[{"source": "cluster_X", "target": "cluster_Y", "label": "short relationship"}, ...]'
    )

    edges = []
    try:
        llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.2, max_tokens=256)
        resp = llm.invoke([HumanMessage(content=edge_prompt)])
        raw = resp.content.strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
        raw_edges: List[Dict] = json.loads(raw.strip())

        for i, e in enumerate(raw_edges[:2]):   # cap at 2
            edges.append({
                "id": f"e{i}_{e['source']}_{e['target']}",
                "source": e["source"],
                "target": e["target"],
                "label": e.get("label", ""),
                "animated": True,
                "style": {"stroke": "#7c3aed"},
            })
    except Exception as exc:
        logger.warning("Edge generation failed: %s — using fallback edge.", exc)
        if len(nodes) >= 2:
            edges.append({
                "id": "e0_fallback",
                "source": nodes[0]["id"],
                "target": nodes[1]["id"],
                "label": "related",
                "animated": True,
                "style": {"stroke": "#7c3aed"},
            })

    logger.info("Graph data built: %d nodes, %d edges", len(nodes), len(edges))
    return {"nodes": nodes, "edges": edges}
