import os
import logging
import json
import asyncio
from typing import List, Dict, Any
import numpy as np
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from engine.embedder import get_document_embedder

logger = logging.getLogger(__name__)

def compute_optimal_clusters(n_chunks: int) -> int:
    """Adaptive cluster count heuristic optimized for RAG hierarchies."""
    if n_chunks < 3: return n_chunks
    if n_chunks < 10: return 3
    if n_chunks < 30: return 4
    if n_chunks < 80: return 6
    if n_chunks < 200: return 8
    return min(12, n_chunks // 20)

async def summarize_cluster_async(cluster_id: int, chunks: List[str]) -> str:
    """Synthesize cluster chunks into a high-impact technical topic summary using Gemini."""
    from engine.fallback_chain import invoke_llm_with_fallback
    
    combined_text = "\n\n---\n\n".join(chunks[:15]) # Limit to top 15 chunks
    if len(combined_text) > 15000:
        combined_text = combined_text[:15000] + "\n\n[truncated]"
        
    system_prompt = """You are a master knowledge synthesizer.
Transform the raw text fragments into a highly technical, cohesive topic summary.
Summarize the main themes, important definitions, and insights in a dense, 2-3 paragraph summary.
Focus strictly on factuality and omit fluff."""

    user_prompt = f"Cluster {cluster_id} passages:\n\n{combined_text}\n\nWrite a comprehensive summary now:"
    
    try:
        resp = await invoke_llm_with_fallback(
            [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)],
            temperature=0.1,
            max_tokens=800
        )
        return str(resp.content).strip()
    except Exception as e:
        logger.error("Failed to summarize cluster %d: %s", cluster_id, e)
        return f"Summary of topic cluster {cluster_id}."

async def build_raptor_tree(chunks_with_metadata: List[Dict[str, Any]], session_id: str) -> List[Dict[str, Any]]:
    """
    RAPTOR tree builder:
    Layer 0: raw leaf nodes (passed as input)
    Layer 1: GMM cluster summaries (topic nodes)
    Layer 2: overall document executive abstract (root node)
    
    Returns: List of newly generated tree nodes at Level 1 and Level 2.
    """
    n_chunks = len(chunks_with_metadata)
    if n_chunks == 0:
        return []
        
    logger.info("Building RAPTOR tree for session %s (n_chunks=%d)", session_id, n_chunks)
    
    from engine.fallback_chain import invoke_llm_with_fallback
    
    # 0. Robust bypass path for small documents (fewer than 3 chunks)
    if n_chunks < 3:
        logger.info("Short document detected (n_chunks=%d). Bypassing GMM/KMeans dimensionality reduction.", n_chunks)
        level_1_nodes = []
        for idx, chunk in enumerate(chunks_with_metadata):
            summary = await summarize_cluster_async(idx, [chunk["text"]])
            level_1_nodes.append({
                "text": summary,
                "session_id": session_id,
                "source_id": chunk.get("source_id", "source_0"),
                "source_title": chunk.get("source_title", "document.pdf"),
                "page_num": chunk.get("page_num", 1),
                "section_title": f"Summary: {chunk.get('section_title') or 'General'}",
                "char_offset": 0,
                "chunk_index": -1,
                "raptor_level": 1,
                "cluster_id": idx
            })
            
        logger.info("Generating Level 2 Document Root Abstract for short document...")
        combined_l1 = "\n\n".join(node["text"] for node in level_1_nodes)
        root_prompt = f"""Given these semantic topic summaries of a document:
{combined_l1}

Write a comprehensive, professional executive abstract (3-4 paragraphs) covering:
1. What this document is fundamentally about.
2. The core architectures, themes, or insights.
3. Key conclusions and actionable takeaways.
Write only the abstract, no introductory or concluding chatter."""

        try:
            root_resp = await invoke_llm_with_fallback(
                [HumanMessage(content=root_prompt)],
                temperature=0.2,
                max_tokens=1000
            )
            root_text = str(root_resp.content).strip()
        except Exception as e:
            logger.error("Root abstract synthesis failed: %s", e)
            root_text = "Executive abstract of document."
            
        rep = chunks_with_metadata[0]
        level_2_node = {
            "text": root_text,
            "session_id": session_id,
            "source_id": rep.get("source_id", "source_0"),
            "source_title": rep.get("source_title", "document.pdf"),
            "page_num": 1,
            "section_title": "Executive Summary",
            "char_offset": 0,
            "chunk_index": -2,
            "raptor_level": 2,
            "cluster_id": -1
        }
        return level_1_nodes + [level_2_node]
        
    # 1. Embed raw chunks
    embedder = get_document_embedder()
    texts = [c["text"] for c in chunks_with_metadata]
    embeddings = await embedder.aembed_documents(texts)
    embeddings_arr = np.array(embeddings, dtype=np.float32)
    
    # 2. Adaptive GMM Clustering with UMAP reduction
    n_components = compute_optimal_clusters(n_chunks)
    logger.info("Clustering into %d semantic components...", n_components)
    
    try:
        from umap import UMAP
        from sklearn.mixture import GaussianMixture
        
        # Reduce dimensionality to improve clustering density
        n_neighbors = min(15, n_chunks - 1) if n_chunks > 1 else 1
        umap_dim = min(10, embeddings_arr.shape[1] - 1) if embeddings_arr.shape[1] > 10 else 2
        
        reducer = UMAP(n_neighbors=n_neighbors, n_components=umap_dim, random_state=42)
        reduced_embeddings = reducer.fit_transform(embeddings_arr)
        
        gmm = GaussianMixture(n_components=n_components, covariance_type="full", random_state=42)
        gmm.fit(reduced_embeddings)
        labels = gmm.predict(reduced_embeddings)
    except Exception as e:
        logger.warning("Advanced clustering failed: %s. Falling back to KMeans.", e)
        from sklearn.cluster import KMeans
        kmeans = KMeans(n_clusters=n_components, random_state=42, n_init="auto")
        labels = kmeans.fit_predict(embeddings_arr)
        
    # 3. Summarize clusters in parallel
    summary_tasks = []
    cluster_indices = {}
    
    for cluster_id in range(n_components):
        # Gather all chunks belonging to this cluster
        cluster_chunks = [chunks_with_metadata[i] for i, label in enumerate(labels) if label == cluster_id]
        if not cluster_chunks:
            continue
            
        cluster_indices[cluster_id] = cluster_chunks
        texts_to_summarize = [c["text"] for c in cluster_chunks]
        summary_tasks.append(summarize_cluster_async(cluster_id, texts_to_summarize))
        
    summaries = await asyncio.gather(*summary_tasks)
    
    level_1_nodes = []
    for cluster_id, summary in zip(cluster_indices.keys(), summaries):
        matching_chunks = cluster_indices[cluster_id]
        # Inherit metadata from the first representative chunk
        rep = matching_chunks[0]
        level_1_nodes.append({
            "text": summary,
            "session_id": session_id,
            "source_id": rep.get("source_id", "source_0"),
            "source_title": rep.get("source_title", "document.pdf"),
            "page_num": rep.get("page_num", 1),
            "section_title": f"Summary: {rep.get('section_title') or 'General'}",
            "char_offset": 0,
            "chunk_index": -1, # Custom tag for synthesis
            "raptor_level": 1,
            "cluster_id": cluster_id
        })
        
    # 4. Level 2: Document Root Executive Summary
    logger.info("Generating Level 2 Document Root Abstract...")
    
    combined_l1 = "\n\n".join(node["text"] for node in level_1_nodes)
    root_prompt = f"""Given these semantic topic summaries of a document:
{combined_l1}

Write a comprehensive, professional executive abstract (3-4 paragraphs) covering:
1. What this document is fundamentally about.
2. The core architectures, themes, or insights.
3. Key conclusions and actionable takeaways.
Write only the abstract, no introductory or concluding chatter."""

    try:
        root_resp = await invoke_llm_with_fallback(
            [HumanMessage(content=root_prompt)],
            temperature=0.2,
            max_tokens=1000
        )
        root_text = str(root_resp.content).strip()
    except Exception as e:
        logger.error("Root abstract synthesis failed: %s", e)
        root_text = "Executive abstract of document."
        
    rep = chunks_with_metadata[0]
    level_2_node = {
        "text": root_text,
        "session_id": session_id,
        "source_id": rep.get("source_id", "source_0"),
        "source_title": rep.get("source_title", "document.pdf"),
        "page_num": 1,
        "section_title": "Executive Summary",
        "char_offset": 0,
        "chunk_index": -2,
        "raptor_level": 2,
        "cluster_id": -1
    }
    
    return level_1_nodes + [level_2_node]
