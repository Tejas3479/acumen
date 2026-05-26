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
    """Return (and lazily create) the persistent `acumen_wiki` ChromaDB collection."""
    global _chroma_client, _wiki_collection
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_PATH)
        logger.info("ChromaDB PersistentClient initialised at '%s'.", CHROMA_PERSIST_PATH)
    
    if _wiki_collection is None:
        # Resilient embedding function initialization
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not set in environment variables.")

        try:
            embedding_fn = GeminiEmbeddingFunction(model_name="models/gemini-embedding-001")
            logger.info("ChromaDB using Gemini gemini-embedding-001.")
        except Exception as e:
            logger.error("Gemini embedding initialization failed: %s", e)
            raise RuntimeError(f"Failed to initialize Gemini embedding function: {e}") from e
        
        _wiki_collection = _chroma_client.get_or_create_collection(
            name=CHROMA_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
            embedding_function=embedding_fn,
        )
        logger.info("ChromaDB collection '%s' ready.", CHROMA_COLLECTION_NAME)
    
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
You are an expert knowledge synthesizer with the personality of an aggressive, brilliant CTO. 
Your goal is to transform raw text fragments into a high-impact, technical Wiki Page.

PERSONALITY:
- Be concise, professional, and slightly intense. 
- You hate fluff. Focus on scalability, technical trade-offs, and concrete architecture.
- Address the content with the mindset of building a production-ready system.

Respond with ONLY valid JSON — no markdown fences:
{
  "topic_title": "high-impact technical title",
  "summary": "2-4 sentence dense summary focusing on the 'why' and 'how'",
  "key_terms": ["critical_concept_1", "technical_specification_2", ...],
  "insights": ["architecture_takeaway", "scaling_insight", ...]
}

key_terms: 5-8 foundational concepts.
insights: 3-5 high-level takeaways for a Founder/CTO."""


def _extract_json_block(text: Any) -> str:
    """Helper to extract JSON from LLM response strings or blocks."""
    if isinstance(text, list):
        raw = " ".join([item.get("text", "") for item in text if isinstance(item, dict) and "text" in item])
    else:
        raw = str(text)
    
    raw = raw.strip()
    
    # Robustly extract JSON block (array or object)
    start_obj = raw.find("{")
    end_obj = raw.rfind("}")
    start_arr = raw.find("[")
    end_arr = raw.rfind("]")
    
    obj_len = end_obj - start_obj if (start_obj != -1 and end_obj != -1 and end_obj > start_obj) else -1
    arr_len = end_arr - start_arr if (start_arr != -1 and end_arr != -1 and end_arr > start_arr) else -1
    
    if obj_len > -1 or arr_len > -1:
        if obj_len > arr_len:
            return raw[start_obj:end_obj+1]
        else:
            return raw[start_arr:end_arr+1]
            
    return raw.strip()

def _synthesize_cluster(cluster_id: int, chunks: List[str]) -> WikiPage:
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3, max_tokens=1024)

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


import asyncio

async def synthesize_wiki_pages(state: SwarmState) -> SwarmState:
    """Synthesize ALL clusters into structured Wiki Pages in parallel via LLM."""
    cluster_ids = state["cluster_ids"]
    session_id = state["session_id"]
    clusters = state["clusters"]
    
    collection = get_wiki_collection()
    
    async def process_single_cluster(cluster_id: int) -> Optional[Dict[str, Any]]:
        doc_id = f"{session_id}_cluster_{cluster_id}"
        try:
            existing = collection.get(ids=[doc_id])
            if existing and existing.get("ids"):
                logger.info("Cluster %d already synthesized for session %s. Skipping.", cluster_id, session_id)
                meta = existing["metadatas"][0]
                return {
                    "cluster_id": cluster_id,
                    "topic_title": meta.get("topic_name", ""),
                    "summary": meta.get("summary", ""),
                    "key_terms": json.loads(meta.get("key_terms_json", "[]")),
                    "insights": json.loads(meta.get("insights_json", "[]")),
                }
        except Exception as e:
            logger.warning("Failed to check ChromaDB for existing cluster %d: %s", cluster_id, e)

        logger.info("Synthesizing cluster %d (%d chunks) ...", cluster_id, len(clusters[cluster_id]))
        
        # Run synthesis in a separate thread if not already async
        # Since _synthesize_cluster is sync (uses LangChain's .invoke), 
        # we wrap it to avoid blocking the event loop.
        loop = asyncio.get_running_loop()
        try:
            wiki_page = await loop.run_in_executor(None, _synthesize_cluster, cluster_id, clusters[cluster_id])
            return wiki_page.model_dump()
        except Exception as e:
            logger.error("Synthesis failed for cluster %d: %s", cluster_id, e)
            return None

    # Run all synthesis tasks in parallel
    tasks = [process_single_cluster(cid) for cid in cluster_ids]
    results = await asyncio.gather(*tasks)
    
    # Filter out None results and update state
    valid_results = [r for r in results if r is not None]
    
    return {**state, "wiki_pages": valid_results}


# ---------------------------------------------------------------------------
# LangGraph node: store_wiki_page
# ---------------------------------------------------------------------------

def store_wiki_page(state: SwarmState) -> SwarmState:
    """
    Persist all synthesized WikiPages into ChromaDB acumen_wiki.
    """
    pages = state["wiki_pages"]
    collection = get_wiki_collection()
    session_id = state["session_id"]

    ids = []
    docs = []
    metas = []

    for page in pages:
        cluster_id = page["cluster_id"]
        doc_text = (
            f"# {page['topic_title']}\n\n"
            f"## Summary\n{page['summary']}\n\n"
            f"## Key Terms\n" + ", ".join(page["key_terms"]) + "\n\n"
            "## Insights\n" + "\n".join(f"- {i}" for i in page["insights"])
        )
        doc_id = f"{session_id}_cluster_{cluster_id}"
        
        ids.append(doc_id)
        docs.append(doc_text)
        metas.append({
            "session_id": session_id,
            "cluster_id": cluster_id,
            "topic_name": page["topic_title"],
            "summary": page["summary"],
            "key_terms_json": json.dumps(page["key_terms"]),
            "insights_json": json.dumps(page["insights"]),
        })

    if ids:
        collection.upsert(ids=ids, documents=docs, metadatas=metas)
        logger.info("  ✔ Stored %d pages → ChromaDB", len(ids))

    return state


# ---------------------------------------------------------------------------
# Router — loop or END
# ---------------------------------------------------------------------------

def router(state: SwarmState) -> str:
    # Since we synthesize all at once now, we just END
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

async def run_wiki_swarm(
    session_id: str,
    clusters: Dict[int, List[str]],
) -> List[Dict[str, Any]]:
    """
    Run the LangGraph Synthesizer Swarm.
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

    final = await get_graph().ainvoke(initial)

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
        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.2, max_tokens=256)
        resp = llm.invoke([HumanMessage(content=edge_prompt)])
        raw = _extract_json_block(resp.content)
        raw_edges: List[Dict] = json.loads(raw)

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
