import json
import logging
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

def generate_audio_script(session_id: str) -> List[Dict[str, str]]:
    """Generates a podcast script for the given session."""
    try:
        col = get_wiki_collection()
        docs = col.get(where={"session_id": session_id})
        
        if not docs or not docs.get("documents"):
            raise ValueError(f"No synthesized wiki data found for session {session_id}")

        text_content = "\n\n".join(docs["documents"])
        
        if len(text_content) > 10000:
            text_content = text_content[:10000]

        llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.7)
        
        resp = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=f"Document snippets:\n\n{text_content}")
        ])
        
        # Extract string content from response robustly (safeguard against list or complex structures)
        content = resp.content
        if isinstance(content, list):
            raw = " ".join([item.get("text", "") for item in content if isinstance(item, dict) and "text" in item])
        else:
            raw = str(content)
        raw = raw.strip()
        
        # Robustly extract JSON block (array)
        start_arr = raw.find("[")
        end_arr = raw.rfind("]")
        
        if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
            raw = raw[start_arr:end_arr+1]

        data = json.loads(raw)
        if not isinstance(data, list):
            raise ValueError("Expected a JSON array")
            
        return data
        
    except Exception as exc:
        logger.error("Failed to generate audio script for %s: %s", session_id, exc)
        raise
