"""
Acumen — Advanced Hybrid Retriever with Query Rewriting and RRF v2
==================================================================
This module implements the 2026 state-of-the-art retrieval pipeline:
1. Multi-turn Query Rewriting: Converts contextual follow-ups into standalone search queries.
2. Dense Retrieval: Uses Gemini-002 RETRIEVAL_QUERY embeddings + ChromaDB cosine similarity.
3. Sparse Retrieval: Fits a local BM25 index over session chunks.
4. Reciprocal Rank Fusion (RRF): Blends dense and sparse rankings with k=60.
5. Local BGE-Reranker-v2-m3: Cross-Encoder reranking for supreme contextual precision.
"""

from __future__ import annotations

import os
import json
import logging
import asyncio
from typing import List, Dict, Any, Optional

import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage

from engine.embedder import get_query_embedder
from engine.vector_store import get_vector_store

logger = logging.getLogger(__name__)

# Singleton for Cross-Encoder reranker
_cross_encoder: Optional[CrossEncoder] = None


def get_cross_encoder() -> CrossEncoder:
    """Lazily load the local BGE Cross-Encoder model."""
    global _cross_encoder
    if _cross_encoder is None:
        logger.info("Loading local BBAAI/bge-reranker-v2-m3 cross-encoder...")
        try:
            # Load with CPU/GPU auto-detection
            _cross_encoder = CrossEncoder("BAAI/bge-reranker-v2-m3", max_length=512)
            logger.info("Successfully loaded local BGE Cross-Encoder.")
        except Exception as e:
            logger.error("Failed to load local CrossEncoder: %s. Reranking will use fallback.", e)
            # Create a mock or fallback class
            class FallbackEncoder:
                def predict(self, pairs: List[List[str]]) -> np.ndarray:
                    # Return neutral scores
                    return np.ones(len(pairs), dtype=np.float32) * 0.5
            _cross_encoder = FallbackEncoder()
    return _cross_encoder


# ---------------------------------------------------------------------------
# Query Rewriter
# ---------------------------------------------------------------------------

QUERY_REWRITE_SYSTEM_PROMPT = """You are an expert search query optimization assistant.
Your task is to take a multi-turn conversation history and a follow-up user query, and rewrite it into a single, standalone search query.
This query will be used to retrieve document passages.
Guidelines:
- Resolve all pronoun references (e.g. "it", "they", "those") to their proper nouns from chat context.
- Strip conversational fluff (e.g. "can you tell me", "what about", "please").
- Focus strictly on technical terms, search keywords, and concepts.
- If the query is already standalone, return it unchanged.
- Return ONLY the raw rewritten text string — no JSON, no conversational banter.
"""

async def rewrite_query(user_message: str, history: List[Dict[str, str]]) -> str:
    """Converts a follow-up message into a standalone keyword search query using Gemini."""
    if not history:
        return user_message

    # Format history snippet
    history_lines = []
    for h in history[-4:]: # Take last 4 turns
        role = h.get("role", "user").upper()
        content = h.get("content", "")
        # Strip long tool outputs if present to avoid prompt bloating
        if "[Tool Result" in content:
            content = content.split("[Tool Result")[0]
        history_lines.append(f"{role}: {content}")
        
    history_block = "\n".join(history_lines)
    user_prompt = f"CHAT HISTORY:\n{history_block}\n\nFOLLOW-UP USER QUERY: {user_message}\n\nSTANDALONE SEARCH QUERY:"

    try:
        from engine.fallback_chain import invoke_llm_with_fallback
        resp = await invoke_llm_with_fallback(
            [
                SystemMessage(content=QUERY_REWRITE_SYSTEM_PROMPT),
                HumanMessage(content=user_prompt)
            ],
            temperature=0,
            max_tokens=100
        )
        rewritten = str(resp.content).strip()
        logger.info("Rewrote query: '%s' -> '%s'", user_message, rewritten)
        return rewritten
    except Exception as e:
        logger.error("Query rewriting failed: %s. Using original query.", e)
        return user_message


# ---------------------------------------------------------------------------
# Hybrid Search & RRF Engine
# ---------------------------------------------------------------------------

class HybridRetriever:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.vector_store = get_vector_store()

    async def _get_all_chunks(self) -> List[Dict[str, Any]]:
        """Fetch all documents belonging to this session from ChromaDB chunks collection."""
        # Wrap the synchronous vector_store.get call in run_in_executor to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        def sync_get():
            return self.vector_store.get(
                collection_name="acumen_chunks",
                where={"session_id": self.session_id},
                include=["metadatas", "documents"]
            )
        
        results = await loop.run_in_executor(None, sync_get)
        
        docs = results.get("documents") or []
        metadatas = results.get("metadatas") or []
        ids = results.get("ids") or []
        
        chunks = []
        for doc_id, text, meta in zip(ids, docs, metadatas):
            chunks.append({
                "id": doc_id,
                "text": text,
                "metadata": meta
            })
        return chunks

    async def retrieve(self, query: str, top_k: int = 5, dense_weight: float = 0.5) -> List[Dict[str, Any]]:
        """
        Execute GraphRAG Hybrid Search:
        1. Dense + BM25 search fused via RRF.
        2. Graph BFS entity-relation expansion from query keywords.
        3. Fuses standard chunks with adjacent graph relations.
        4. Reranked with local BGE Cross-Encoder for supreme precision.
        """
        logger.info("Starting GraphRAG Hybrid Retrieval for query: '%s'", query)
        
        # 1. Fetch all candidate chunks for this notebook
        all_chunks = await self._get_all_chunks()
        if not all_chunks:
            logger.warning("No chunks found in database for session_id: %s", self.session_id)
            return []

        # 2. Dense Vector Search (Top 30 candidates)
        embedder = get_query_embedder()
        query_embedding = await embedder.aembed_query(query)
        
        loop = asyncio.get_running_loop()
        def sync_query():
            return self.vector_store.query(
                collection_name="acumen_chunks",
                query_embedding=query_embedding,
                n_results=min(30, len(all_chunks)),
                where={"session_id": self.session_id}
            )
            
        dense_results = await loop.run_in_executor(None, sync_query)
        
        dense_ids = dense_results.get("ids", [[]])[0]
        dense_docs = dense_results.get("documents", [[]])[0]
        dense_metas = dense_results.get("metadatas", [[]])[0]
        
        dense_ranking = []
        for doc_id, doc, meta in zip(dense_ids, dense_docs, dense_metas):
            dense_ranking.append({
                "id": doc_id,
                "text": doc,
                "metadata": meta
            })

        # 3. Sparse BM25 Search (Top 30 candidates)
        corpus = [c["text"].lower().split() for c in all_chunks]
        bm25 = BM25Okapi(corpus)
        
        tokenized_query = query.lower().split()
        bm25_scores = bm25.get_scores(tokenized_query)
        
        bm25_ranking_indices = np.argsort(bm25_scores)[::-1][:30]
        sparse_ranking = []
        for idx in bm25_ranking_indices:
            score = bm25_scores[idx]
            if score > 0:
                sparse_ranking.append(all_chunks[idx])

        # 4. Reciprocal Rank Fusion (RRF k=60)
        fused_scores = {}
        chunk_map = {c["id"]: c for c in all_chunks}
        
        k = 60
        for rank, item in enumerate(dense_ranking):
            doc_id = item["id"]
            fused_scores[doc_id] = fused_scores.get(doc_id, 0.0) + (1.0 / (k + (rank + 1)))
            
        for rank, item in enumerate(sparse_ranking):
            doc_id = item["id"]
            fused_scores[doc_id] = fused_scores.get(doc_id, 0.0) + (1.0 / (k + (rank + 1)))

        sorted_fused = sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)
        top_candidates = [chunk_map[doc_id] for doc_id, _ in sorted_fused[:15]]
        
        if not top_candidates:
            top_candidates = all_chunks[:15]

        # 4.5. GraphRAG BFS Expansion (Upgrade B)
        # Extract 1-3 main concepts from the query to seed our BFS graph walk
        query_entities = []
        try:
            from engine.fallback_chain import invoke_llm_with_fallback
            entity_prompt = f"""Extract at most 3 core entity nouns, technologies, or main subject concepts from this query.
            Return ONLY a clean, comma-separated list of terms (e.g., "fastapi, openmcp, chroma"). If none, return "none".
            Query: {query}"""
            
            resp = await invoke_llm_with_fallback(
                [HumanMessage(content=entity_prompt)],
                temperature=0,
                max_tokens=30
            )
            terms = str(resp.content).strip().split(",")
            query_entities = [t.strip().lower() for t in terms if t.strip().lower() != "none" and len(t.strip()) > 1]
        except Exception:
            # Fallback to simple keyword extraction
            query_entities = [w.strip("?,.!-").lower() for w in query.split() if len(w) > 4]

        virtual_graph_chunks = []
        if query_entities:
            try:
                from engine.graph_store import traverse_bfs
                logger.info("Triggering GraphRAG BFS walk for seed entities: %s", query_entities)
                graph_context = traverse_bfs(self.session_id, query_entities, depth=2)
                
                # Turn each retrieved graph relation into a virtual candidate chunk
                for idx, relation in enumerate(graph_context):
                    virtual_graph_chunks.append({
                        "id": f"graph_virtual_{idx}",
                        "text": f"[Knowledge Graph Relation] {relation}",
                        "metadata": {
                            "session_id": self.session_id,
                            "source_id": "graph_rag",
                            "source_title": "Interactive Knowledge Graph",
                            "page_num": 1,
                            "section_title": "GraphRAG Context Integration",
                            "char_offset": 0,
                            "chunk_index": -10 - idx,
                            "raptor_level": 3,
                            "cluster_id": -99,
                            "raw_text_only": relation
                        }
                    })
            except Exception as graph_err:
                logger.error("GraphRAG BFS query failed: %s", graph_err)

        # Merge standard chunks with relational context
        candidate_pool = top_candidates + virtual_graph_chunks
        logger.info("Reranking joint pool: %d standard chunks + %d virtual graph relations...", len(top_candidates), len(virtual_graph_chunks))

        # 5. Local BGE Cross-Encoder Reranking
        cross_encoder = get_cross_encoder()
        pairs = [[query, c["text"]] for c in candidate_pool]
        
        try:
            scores = cross_encoder.predict(pairs)
            ranked_indices = np.argsort(scores)[::-1]
            
            reranked_results = []
            for rank_idx in ranked_indices:
                reranked_results.append(candidate_pool[rank_idx])
                
            logger.info("Successfully reranked documents with GraphRAG details.")
            return reranked_results[:top_k]
        except Exception as e:
            logger.error("BGE Reranking prediction crashed: %s. Falling back to RRF ordering.", e)
            return top_candidates[:top_k]
