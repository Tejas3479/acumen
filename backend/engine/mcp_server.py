import os
import json
import logging
from typing import Any, Dict, List, Optional
from mcp.server.fastmcp import FastMCP

from engine.wiki_swarm import get_wiki_collection
from engine.action_agent import run_agent_chat
from engine.retriever import HybridRetriever

logger = logging.getLogger("acumen.mcp_server")

# Create FastMCP instance
mcp = FastMCP("ACUMEN")

@mcp.tool()
async def search_knowledge_base(session_id: str, query: str, top_k: int = 5) -> str:
    """
    Search the raw text chunks of a specific notebook in ACUMEN.
    
    Args:
        session_id: The UUID session ID of the notebook.
        query: The search query to locate relevant content.
        top_k: Number of top results to return (default 5).
    """
    try:
        retriever = HybridRetriever(session_id=session_id)
        docs = await retriever.retrieve(query, top_k=top_k)
        if not docs:
            return "No relevant content found in this notebook."
            
        compiled = []
        for doc in docs:
            meta = doc["metadata"]
            src_title = meta.get("source_title", "document")
            page_num = meta.get("page_num", 1)
            raw_text = doc["text"]
            compiled.append(f"[Source: {src_title}, Page {page_num}]\n{raw_text}")
            
        return "\n\n---\n\n".join(compiled)
    except Exception as e:
        logger.exception("MCP search_knowledge_base failed:")
        return f"Error searching knowledge base: {str(e)}"

@mcp.tool()
async def query_notebook(session_id: str, query: str) -> str:
    """
    Ask a question to the ACUMEN multi-agent swarm for a specific notebook.
    
    Args:
        session_id: The UUID session ID of the notebook.
        query: The question to ask the agent.
    """
    try:
        # We run the agent chat turn without a full conversation history
        result = await run_agent_chat(
            session_id=session_id,
            user_message=query,
            history=[],
            user_id="mcp-client",
            ip_address="127.0.0.1"
        )
        return result.get("response", "No response generated.")
    except Exception as e:
        logger.exception("MCP query_notebook failed:")
        return f"Error querying notebook: {str(e)}"

@mcp.tool()
async def get_wiki_pages(session_id: str) -> str:
    """
    Retrieve all synthesized Wiki pages (high-impact summarized topics) for a specific notebook.
    
    Args:
        session_id: The UUID session ID of the notebook.
    """
    try:
        collection = get_wiki_collection()
        results = collection.get(where={"session_id": session_id})
        
        metadatas = results.get("metadatas") or []
        if not metadatas:
            return "No synthesized wiki pages found for this notebook. Ensure synthesis is completed."
            
        compiled = []
        for meta in metadatas:
            key_terms = json.loads(meta.get("key_terms_json", "[]"))
            insights = json.loads(meta.get("insights_json", "[]"))
            
            wiki = (
                f"# {meta.get('topic_name', 'Topic')}\n\n"
                f"## Summary\n{meta.get('summary', '')}\n\n"
                f"## Key Terms\n" + ", ".join(key_terms) + "\n\n"
                f"## Insights\n" + "\n".join(f"- {ins}" for ins in insights)
            )
            compiled.append(wiki)
            
        return "\n\n---\n\n".join(compiled)
    except Exception as e:
        logger.exception("MCP get_wiki_pages failed:")
        return f"Error retrieving wiki pages: {str(e)}"
