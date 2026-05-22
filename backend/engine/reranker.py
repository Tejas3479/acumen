import json
import logging
import hashlib
from typing import List, Any, Dict, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

# Initialize the Gemini model lazily for fallback use
_reranker_llm = None

def _get_reranker_llm():
    global _reranker_llm
    if _reranker_llm is None:
        _reranker_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    return _reranker_llm

# Semantic Reranking Cache
_rerank_cache: Dict[str, List[str]] = {}


def _get_rerank_cache_key(query: str, documents: List[str]) -> str:
    """Generate a unique SHA-256 hash of the query and candidate documents list."""
    hasher = hashlib.sha256()
    hasher.update(query.strip().lower().encode("utf-8"))
    for doc in documents:
        hasher.update(doc.strip().encode("utf-8"))
    return hasher.hexdigest()


async def rerank_documents(query: str, documents: List[str], top_k: int = 5) -> List[str]:
    """
    Two-Stage RAG: Reranks documents based on their relevance to a user query.
    
    Uses Gemini Flash as a robust, high-performance Cross-Encoder reranker.
    """
    if not documents:
        return []

    if len(documents) <= top_k:
        return documents

    # 1. Semantic Cache Check
    cache_key = _get_rerank_cache_key(query, documents)
    if cache_key in _rerank_cache:
        logger.info("Semantic Cache Hit: Serving cached ranked documents.")
        return _rerank_cache[cache_key][:top_k]

    # 2. Gemini Flash Cross-Encoder Strategy
    logger.info("Executing Gemini Flash Cross-Encoder reranking...")
    
    # Format documents with indices for the LLM to reference
    formatted_docs = ""
    for i, doc in enumerate(documents):
        # Truncate very long docs for the reranking prompt to stay within context
        preview = doc[:800].replace("\n", " ")
        formatted_docs += f"[{i}] {preview}\n\n"

    system_prompt = (
        "You are an expert information retrieval system. Your task is to rerank a list of document "
        "snippets based on their relevance to a user query. You must return ONLY a raw JSON array "
        "of integers representing the indices of the top documents, sorted by relevance from most to least relevant."
    )

    user_prompt = (
        f"USER QUERY: {query}\n\n"
        f"DOCUMENTS TO RANK:\n{formatted_docs}\n"
        f"Return the indices of the top {top_k} most relevant documents as a raw JSON array like [3, 0, 12, ...]."
    )

    try:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt)
        ]
        
        llm = _get_reranker_llm()
        response = await llm.ainvoke(messages)
        
        # Robustly extract JSON block content
        raw = response.content if isinstance(response.content, str) else ""
        if isinstance(response.content, list):
            raw = " ".join([item.get("text", "") for item in response.content if isinstance(item, dict) and "text" in item])
        
        raw = raw.strip()
        
        # Clean up possible markdown code blocks
        start_arr = raw.find("[")
        end_arr = raw.rfind("]")
        
        if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
            json_str = raw[start_arr:end_arr+1]
        else:
            json_str = raw

        # Parse the JSON array of indices
        indices = json.loads(json_str)
        
        if not isinstance(indices, list):
            raise ValueError("Reranker response was not a JSON list")

        # Map back to original documents
        refined_docs = []
        for idx in indices:
            try:
                # Handle possible string representation of int
                i = int(idx)
                if 0 <= i < len(documents):
                    refined_docs.append(documents[i])
            except (ValueError, TypeError):
                continue
            
            if len(refined_docs) >= top_k:
                break
        
        # Fill in with original documents if LLM returned fewer than needed
        if len(refined_docs) < top_k:
            for doc in documents:
                if doc not in refined_docs:
                    refined_docs.append(doc)
                if len(refined_docs) >= top_k:
                    break

        logger.info(f"LLM Reranker successfully refined {len(documents)} docs down to {len(refined_docs)}")
        
        # Cache and return
        _rerank_cache[cache_key] = refined_docs
        return refined_docs[:top_k]

    except Exception as e:
        logger.error(f"LLM Reranking fallback failed: {str(e)}. Returning original order.")
        # Final fallback: return the first top_k documents
        fallback_docs = documents[:top_k]
        _rerank_cache[cache_key] = fallback_docs
        return fallback_docs
