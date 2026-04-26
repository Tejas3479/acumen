import json
import logging
from typing import List
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)

# Initialize the model once for reuse
# Temperature is 0 for deterministic ranking
reranker_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

async def rerank_documents(query: str, documents: List[str], top_k: int = 5) -> List[str]:
    """
    Two-Stage RAG: Uses an LLM as a Cross-Encoder to rerank documents
    retrieved from a vector store.
    """
    if not documents:
        return []
    
    if len(documents) <= top_k:
        return documents

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
        
        # Note: In a production environment with high concurrency, you might want to use a lock 
        # or separate instances if the LLM wrapper isn't thread-safe, but for Flash it's usually fine.
        response = await reranker_llm.ainvoke(messages)
        content = response.content.strip()
        
        # Clean up possible markdown code blocks
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()

        # Parse the JSON array of indices
        indices = json.loads(content)
        
        if not isinstance(indices, list):
            raise ValueError("LLM response was not a list")

        # Map back to original documents
        refined_docs = []
        for idx in indices:
            if isinstance(idx, int) and 0 <= idx < len(documents):
                refined_docs.append(documents[idx])
            
            if len(refined_docs) >= top_k:
                break
        
        logger.info(f"Reranker successfully refined {len(documents)} docs down to {len(refined_docs)}")
        return refined_docs

    except Exception as e:
        logger.error(f"Reranking failed: {str(e)}. Falling back to original order.")
        # Fallback: return the first top_k documents
        return documents[:top_k]
