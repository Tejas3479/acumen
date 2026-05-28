import json
import logging
import os
from typing import List, Dict

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from engine.wiki_swarm import get_wiki_collection

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are two enthusiastic podcast hosts, Host A and Host B.
Based on the provided document excerpts, write a short, highly engaging 30-second back-and-forth podcast script discussing the core concepts.
Host A usually drives the conversation and Host B provides insights or analogies.
You MUST return ONLY a raw JSON array. DO NOT wrap it in markdown formatting or add conversational text.
Format:
[
  {"host": "A", "text": "..."},
  {"host": "B", "text": "..."}
]
"""

async def generate_audio_script(session_id: str) -> List[Dict[str, str]]:
    """Generates a podcast script for the given session."""
    try:
        col = get_wiki_collection()
        docs = col.get(where={"session_id": session_id})
        
        if not docs or not docs.get("documents"):
            raise ValueError(f"No synthesized wiki data found for session {session_id}")

        text_content = "\n\n".join(docs["documents"])
        
        if len(text_content) > 10000:
            text_content = text_content[:10000]

        from engine.fallback_chain import invoke_llm_with_fallback
        
        resp = await invoke_llm_with_fallback(
            [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=f"Document snippets:\n\n{text_content}")
            ],
            temperature=0.7,
            max_tokens=2048,
            structured_json=True
        )
        
        # Extract string content from response robustly (safeguard against list or complex structures)
        content = resp.content
        if isinstance(content, list):
            raw = " ".join([item.get("text", "") for item in content if isinstance(item, dict) and "text" in item])
        else:
            raw = str(content)
        raw = raw.strip()
        
        # Robustly extract JSON block (array)
        from engine.wiki_swarm import _extract_json_block
        raw = _extract_json_block(raw)

        data = json.loads(raw)
        if not isinstance(data, list):
            raise ValueError("Expected a JSON array")
            
        return data
        
    except Exception as exc:
        logger.error("Failed to generate audio script for %s: %s", session_id, exc)
        raise
