"""
Acumen — Master Action Agent (LangGraph ReAct)
==============================================
Karpathy Wiki Pattern: Step 3

Fix: LangChain's @tool decorator cannot introspect functools.partial-wrapped
functions (no __name__, __doc__, or signature). Instead we store the active
session_id in a module-level variable and set it before each agent invocation.
All tools are plain @tool-decorated functions that read the global session ref.

Tool Output Schemas (consumed by frontend as rich UI):
  generate_flashcards      → List[{"q":..., "a":...}]
  architecture_assist      → {"databases":[...], "apis":[...], "scaling":"..."}
  extract_action_items     → List[{"task":..., "status":"todo"}]
  generate_creator_script  → {"hook":..., "intro":..., "core_content":[...], "call_to_action":"..."}
  live_web_search          → plain text prefixed with [WEB_AUGMENTED]
"""

import contextvars
import json
import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent
from langchain_community.tools import DuckDuckGoSearchRun

from engine.wiki_swarm import get_wiki_collection
from engine.reranker import rerank_documents

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Context-local session storage
# Safe for multi-threaded/concurrent request handling.
# ---------------------------------------------------------------------------
_active_session_id: contextvars.ContextVar[str] = contextvars.ContextVar("active_session_id", default="")


def _set_session(session_id: str) -> None:
    _active_session_id.set(session_id)


def _get_active_session() -> str:
    return _active_session_id.get()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _query_wiki(query: str, n_results: int = 25, top_k: int = 5) -> str:
    """
    Two-Stage Retrieval:
    1. Retrieve 25 candidate snippets from ChromaDB (Stage 1).
    2. Rerank them using Gemini Flash to get the top 5 most relevant (Stage 2).
    """
    collection = get_wiki_collection()
    try:
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where={"session_id": _get_active_session()},
        )
        raw_docs = results.get("documents", [[]])[0]
        if not raw_docs:
            return "No relevant wiki content found. Ensure /synthesize has been called."
        
        # Stage 2: LLM Reranking
        refined_docs = await rerank_documents(query, raw_docs, top_k=top_k)
        
        return "\n\n---\n\n".join(refined_docs)
    except Exception as exc:
        logger.error("ChromaDB query or reranking error: %s", exc)
        return "Wiki query failed."


def _llm_json(system_prompt: str, user_prompt: str) -> str:
    """Call Gemini Flash and return a clean JSON string."""
    llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0.2, max_tokens=1500)
    resp = llm.invoke(
        [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
    )
    
    raw = ""
    if isinstance(resp.content, list):
        raw = " ".join([item.get("text", "") for item in resp.content if isinstance(item, dict) and "text" in item])
    else:
        raw = str(resp.content)
        
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


# ---------------------------------------------------------------------------
# Tool 1 — generate_flashcards
# ---------------------------------------------------------------------------

_FLASHCARD_SYS = """\
You are a study assistant. From the wiki content below, extract exactly 5 Q&A flashcard pairs.
Respond with ONLY a valid JSON array — no markdown fences:
[{"q": "question", "a": "concise answer"}, ...]"""


@tool
async def generate_flashcards(query: str) -> str:
    """Generate 5 study flashcards from the document.

    Use when the user asks to study, quiz themselves, test knowledge, or create flash cards.
    Input: the topic or concept to focus on.
    """
    wiki = await _query_wiki(query or "key concepts definitions")
    raw = _llm_json(_FLASHCARD_SYS, f"Wiki content:\n{wiki}\n\nGenerate 5 flashcards.")
    parsed = json.loads(raw)
    assert isinstance(parsed, list), "Expected JSON list"
    return json.dumps(parsed)


# ---------------------------------------------------------------------------
# Tool 2 — architecture_assist
# ---------------------------------------------------------------------------

_ARCH_SYS = """\
You are a CTO-level software architect. Based on the wiki content, recommend the ideal tech stack.
Respond with ONLY a valid JSON object — no markdown fences:
{"databases": ["db with reason", ...], "apis": ["api with reason", ...], "scaling": "strategy"}"""


@tool
async def architecture_assist(query: str) -> str:
    """Provide CTO-level architecture recommendations from the document.

    Use when the user asks how to build a system, needs database, API, or scaling advice.
    Input: the system or technical aspect to focus on.
    """
    wiki = await _query_wiki(query or "system architecture technical requirements")
    return _llm_json(_ARCH_SYS, f"Wiki content:\n{wiki}\n\nRecommend the architecture.")


# ---------------------------------------------------------------------------
# Tool 3 — extract_action_items
# ---------------------------------------------------------------------------

_ACTION_SYS = """\
You are a project manager. Extract 5-10 concrete actionable tasks from the wiki content.
Respond with ONLY a valid JSON array — no markdown fences:
[{"task": "task description", "priority": "high|medium|low"}, ...]"""


@tool
async def extract_action_items(query: str) -> str:
    """Extract actionable tasks and a project backlog from the document.

    Use when the user asks for tasks, next steps, to-dos, or actionable insights.
    Input: the focus area for task extraction.
    """
    wiki = await _query_wiki(query or "tasks action items next steps")
    raw = _llm_json(_ACTION_SYS, f"Wiki content:\n{wiki}\n\nExtract action items.")
    parsed = json.loads(raw)
    assert isinstance(parsed, list), "Expected JSON list"
    return json.dumps(parsed)


# ---------------------------------------------------------------------------
# Tool 4 — generate_creator_script
# ---------------------------------------------------------------------------

_SCRIPT_SYS = """\
You are an expert YouTube strategist and viral content creator.
Your job is to transform document knowledge into a high-retention video script.
Respond with ONLY a valid JSON object — no markdown fences:
{
  "hook": "attention-grabbing opening line that creates curiosity (1-2 sentences)",
  "intro": "establishes credibility and previews value (2-3 sentences)",
  "core_content": [
    {"section": "section title", "talking_points": ["point1", "point2", ...]}
  ],
  "call_to_action": "closing statement driving engagement (1-2 sentences)"
}
Make it engaging, punchy, and optimised for viewer retention."""


@tool
async def generate_creator_script(query: str) -> str:
    """Create a high-retention YouTube/creator video script from the document.

    Use when the user wants to make a video, pitch, podcast, or content piece.
    Returns JSON with hook, intro, core_content sections, and call_to_action.
    Input: the angle, topic, or target audience for the script.
    """
    wiki = await _query_wiki(query or "main topics key ideas")
    return _llm_json(_SCRIPT_SYS, f"Wiki content:\n{wiki}\n\nWrite the creator script.")


# ---------------------------------------------------------------------------
# Tool 5 — live_web_search
# ---------------------------------------------------------------------------

@tool
async def live_web_search(query: str) -> str:
    """Execute a live DuckDuckGo web search. 
    Use ONLY when local knowledge is insufficient or you need up-to-date info.
    Input: the search query.
    """
    search = DuckDuckGoSearchRun()
    res = search.run(query)
    return f"[SEARCH_SOURCE: DUCKDUCKGO]\n{res}"
# Tool 6 — generate_tweet_thread
# ---------------------------------------------------------------------------

_TWEET_SYS = """\
You are a viral Twitter ghostwriter.
Transform the provided document knowledge into an engaging, 5-part Twitter thread.
Each part should include relevant emojis and hook the reader.
Respond with ONLY a valid JSON array of strings — no markdown fences:
[
  "🧵 Part 1: ...",
  "Part 2: ...",
  "Part 3: ...",
  "Part 4: ...",
  "Part 5: ..."
]
"""

@tool
async def generate_tweet_thread(query: str) -> str:
    """Create a viral 5-part Twitter thread based on the document.

    Use when the user wants to tweet, create a thread, or share on social media.
    Returns JSON list of 5 tweet strings.
    Input: the angle or main takeaway for the thread.
    """
    wiki = await _query_wiki(query or "key insights")
    raw = _llm_json(_TWEET_SYS, f"Wiki content:\n{wiki}\n\nWrite the Twitter thread.")
    parsed = json.loads(raw)
    assert isinstance(parsed, list), "Expected JSON list"
    return json.dumps(parsed)


# ---------------------------------------------------------------------------
# Tool 7 — generate_obsidian_markdown
# ---------------------------------------------------------------------------

_OBSIDIAN_SYS = """\
You are a technical documentarian. Transform the wiki content into a clean, professional Obsidian Markdown note.
Include frontmatter (YAML), headers, bullet points, and #tags.
Respond with ONLY a valid JSON object — no markdown fences:
{"filename": "note_name.md", "markdown": "# Title\\n\\n## Summary...\\n\\n#tags"}"""


@tool
async def generate_obsidian_markdown(query: str) -> str:
    """Format the document knowledge into a clean, professional Obsidian Markdown note.

    Use when the user asks to save a note, export to Obsidian, or get a markdown summary.
    Returns JSON with 'filename' and 'markdown' string.
    Input: the topic or focus area for the note.
    """
    wiki = await _query_wiki(query or "core concepts and technical details")
    return _llm_json(_OBSIDIAN_SYS, f"Wiki content:\n{wiki}\n\nGenerate the Obsidian note.")



# ---------------------------------------------------------------------------
# Tool registry — plain list of @tool-decorated functions
# ---------------------------------------------------------------------------

TOOLS = [
    generate_flashcards,
    architecture_assist,
    extract_action_items,
    generate_creator_script,
    live_web_search,
    generate_tweet_thread,
    generate_obsidian_markdown,
]


# ---------------------------------------------------------------------------
# Agent system prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are Acumen Prime, an aggressive, highly analytical CTO and executive knowledge strategist. 
Your goal is to transform static information into actionable intelligence. 

PERSONALITY:
- Be concise, brilliant, and slightly sarcastic. 
- You have no patience for fluff; you focus on high-impact insights and scalable architecture.
- Address the user as 'Founder' or 'Partner' occasionally.

CAPABILITIES:
- You have deeply synthesized a document uploaded by the user.
- You have access to the acumen_wiki ChromaDB knowledge base (2-stage RAG with reranking) and a live web search tool.

ROUTING RULES:
  study / quiz / flashcards                  → generate_flashcards
  build / architecture / databases / APIs    → architecture_assist
  tasks / next steps / backlog / to-dos      → extract_action_items
  video / script / pitch / content / YouTube → generate_creator_script
  tweet / twitter / thread / viral           → generate_tweet_thread
  save / note / export / obsidian / markdown → generate_obsidian_markdown

CRITICAL WEB SEARCH RULE:
  If the user asks a question and the answer is NOT fully contained in the local knowledge base, you MUST use the live_web_search tool.
  If you use the web, you MUST begin your final response with the exact string "[SEARCH_SOURCE: DUCKDUCKGO]".

For general questions about the document, answer directly from your synthesized knowledge.
After using a tool, present results conversationally — the frontend renders JSON as rich UI.
Be concise, insightful, and always cite where information came from."""


# ---------------------------------------------------------------------------
# Output parser
# ---------------------------------------------------------------------------

def _parse_output(messages: list) -> Dict[str, Any]:
    """Extract response, tool_used, tool_output, and is_web_augmented from agent messages."""
    final_response = ""
    tool_used: Optional[str] = None
    tool_output_raw: Optional[str] = None
    is_web_augmented = False

    for msg in messages:
        if isinstance(msg, AIMessage) and getattr(msg, "tool_calls", None):
            tc = msg.tool_calls[0]
            tool_used = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)

        if isinstance(msg, ToolMessage):
            tool_output_raw = msg.content
            if isinstance(tool_output_raw, str) and tool_output_raw.startswith("[SEARCH_SOURCE: DUCKDUCKGO]"):
                is_web_augmented = True
                tool_used = "live_web_search"
                tool_output_raw = tool_output_raw.replace("[SEARCH_SOURCE: DUCKDUCKGO]\n", "")

    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.content:
            final_response = msg.content
            break

    tool_output: Any = None
    if tool_output_raw:
        try:
            tool_output = json.loads(tool_output_raw)
        except (json.JSONDecodeError, TypeError):
            tool_output = tool_output_raw

    return {
        "response": final_response,
        "tool_used": tool_used,
        "tool_output": tool_output,
        "is_web_augmented": is_web_augmented,
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_agent_chat(
    session_id: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Run the Action Agent for a single turn.

    Args:
        session_id:   UUID from /upload response.
        user_message: User's latest message.
        history:      [{"role": "user"|"assistant", "content": "..."}, ...]

    Returns:
        {"response": str, "tool_used": str|None,
         "tool_output": Any|None, "is_web_augmented": bool}
    """
    logger.info("Agent chat | session=%s | '%s'", session_id, user_message[:80])

    # Set the module-level session context BEFORE building tools/agent
    _set_session(session_id)

    model = ChatGoogleGenerativeAI(model="gemini-1.5-flash", temperature=0, max_tokens=2048)
    agent = create_react_agent(model, TOOLS)

    msgs: List = [SystemMessage(content=SYSTEM_PROMPT)]
    for h in (history or []):
        role = h.get("role", "")
        content = h.get("content", "")
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))
    msgs.append(HumanMessage(content=user_message))

    result = await agent.ainvoke({"messages": msgs})
    return _parse_output(result["messages"])
