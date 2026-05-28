"""
Acumen — Hierarchical Multi-Agent Orchestrator Swarms (Multi-Agent Swarm)
========================================================================

Architecture:
               [ Orchestration Agent ] <--- Dynamic Creation
                      /        |        \
                     v         v         v
                 [Agent A]  [Agent B]  [Agent C]

This module implements a state-of-the-art hierarchical orchestrator swarm. 
When a request is received:
1. The Orchestration Director Agent evaluates the query and chat history to form a tactical plan.
2. It dynamically spawns the specialized sub-agents:
   - ResearchAgent: Semantic document retrieval (ChromaDB) & DuckDuckGo web audits.
   - StudyAgent: Generates high-retention Q&A study cards.
   - DevOpsAgent: Generates architectures, DB schemas, API plans, and sprint task lists.
   - CreatorAgent: Generates YouTube creator scripts and viral tweet threads.
   - DocumentAgent: Compiles Obsidian Markdown notes.
3. Spawns tasks in parallel using asyncio.gather for peak performance.
4. Consolidates plans, active agent profiles, and structured JSON payloads into a unified format.
"""

import contextvars
import json
import os
import logging
import asyncio
from typing import Any, Dict, List, Optional

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchRun

import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict

from engine.retriever import HybridRetriever, rewrite_query
from engine.audit import log_event, AUDIT_TOOL_CALL
from engine.fallback_chain import invoke_llm_with_fallback

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Context-local session storage (Safe for concurrent request handling)
# ---------------------------------------------------------------------------
_active_session_id: contextvars.ContextVar[str] = contextvars.ContextVar("active_session_id", default="")
_active_user_id: contextvars.ContextVar[str] = contextvars.ContextVar("active_user_id", default="")
_active_ip_address: contextvars.ContextVar[str] = contextvars.ContextVar("active_ip_address", default="")


def _set_session(session_id: str, user_id: str = "", ip_address: str = "") -> None:
    _active_session_id.set(session_id)
    _active_user_id.set(user_id)
    _active_ip_address.set(ip_address)


def _get_active_session() -> str:
    return _active_session_id.get()


def _get_active_user_id() -> str:
    return _active_user_id.get()


def _get_active_ip_address() -> str:
    return _active_ip_address.get()


# ---------------------------------------------------------------------------
# Two-Stage RAG Vector Search & Web Search Helpers
# ---------------------------------------------------------------------------

async def _query_wiki(query: str, n_results: int = 25, top_k: int = 5) -> str:
    """
    Advanced Hybrid Retrieval:
    Queries the multi-tenant isolatd acumen_chunks collection using Dense + Sparse BM25
    fused via RRF k=60, and reranks via BGE-Reranker-v2-m3.
    """
    try:
        retriever = HybridRetriever(session_id=_get_active_session())
        refined_docs = await retriever.retrieve(query, top_k=top_k)
        if not refined_docs:
            return "No relevant content found. Ensure document ingestion is completed."
        
        compiled_texts = []
        for doc in refined_docs:
            meta = doc["metadata"]
            src_title = meta.get("source_title", "document")
            page_num = meta.get("page_num", 1)
            raw_text = doc["text"]
            
            # Contextual summary can be trimmed or left in.
            # We present a clean passage annotated with the original source and page boundaries.
            compiled_texts.append(f"[Source: {src_title}, Page {page_num}]\n{raw_text}")
            
        return "\n\n---\n\n".join(compiled_texts)
    except Exception as exc:
        logger.error("ChromaDB hybrid query or cross-encoder reranking error: %s", exc)
        return "Hybrid query failed."


async def _llm_json(system_prompt: str, user_prompt: str) -> str:
    """Call Gemini and return a clean JSON string using native Structured Output and fallback logic."""
    resp = await invoke_llm_with_fallback(
        [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)],
        temperature=0.2,
        max_tokens=1500,
        structured_json=True
    )
    
    raw = ""
    if isinstance(resp.content, list):
        raw = " ".join([item.get("text", "") for item in resp.content if isinstance(item, dict) and "text" in item])
    else:
        raw = str(resp.content)
        
    return raw.strip()


# ---------------------------------------------------------------------------
# Specialized Dynamic Sub-Agents implementation
# ---------------------------------------------------------------------------

# Agent A: ResearchAgent (Semantic Context Auditor)
async def run_research_agent(query: str) -> Dict[str, Any]:
    """Retrieves document data and audits live web details if needed."""
    log_event(
        AUDIT_TOOL_CALL,
        user_id=_get_active_user_id(),
        session_id=_get_active_session(),
        ip_address=_get_active_ip_address(),
        tool_name="ResearchAgent",
        query=query
    )
    # 1. Check local RAG
    wiki_context = await _query_wiki(query or "general query")
    
    # 2. Check if query wants live information
    q_lower = query.lower()
    needs_web = (
        "live" in q_lower or 
        "latest" in q_lower or 
        "current" in q_lower or 
        "recent" in q_lower or 
        "news" in q_lower or 
        "web" in q_lower or
        "search" in q_lower
    )
    
    web_result = ""
    if needs_web:
        try:
            loop = asyncio.get_running_loop()
            search = DuckDuckGoSearchRun()
            web_result = await loop.run_in_executor(None, search.run, query)
        except Exception as e:
            logger.warning("DuckDuckGo search run failed: %s", e)
            web_result = "Live web search unavailable."
            
    return {
        "wiki_context": wiki_context,
        "web_search": web_result,
        "is_web_augmented": bool(web_result)
    }


# Agent B: StudyAgent (Cognitive Retrieval Specialist)
_FLASHCARD_SYS = """\
You are a study assistant. From the wiki content below, extract exactly 5 Q&A flashcard pairs.
Respond with ONLY a valid JSON array — no markdown fences:
[{"q": "question", "a": "concise answer"}, ...]"""

async def run_study_agent(wiki_context: str, query: str) -> List[Dict[str, str]]:
    """Synthesizes high-retention Q&A study cards."""
    log_event(
        AUDIT_TOOL_CALL,
        user_id=_get_active_user_id(),
        session_id=_get_active_session(),
        ip_address=_get_active_ip_address(),
        tool_name="StudyAgent",
        query=query
    )
    raw = await _llm_json(_FLASHCARD_SYS, f"Wiki content:\n{wiki_context}\n\nGenerate 5 flashcards.")
    parsed = json.loads(raw)
    assert isinstance(parsed, list), "Expected JSON list"
    return parsed


# Agent C: DevOpsAgent (System Architecture Director)
_ARCH_SYS = """\
You are a CTO-level software architect. Based on the wiki content, recommend the ideal tech stack.
Respond with ONLY a valid JSON object — no markdown fences:
{"databases": ["db with reason", ...], "apis": ["api with reason", ...], "scaling": "strategy"}"""

_ACTION_SYS = """\
You are a project manager. Extract 5-10 concrete actionable tasks from the wiki content.
Respond with ONLY a valid JSON array — no markdown fences:
[{"task": "task description", "priority": "high|medium|low"}, ...]"""

async def run_devops_agent(wiki_context: str, query: str, request_type: str = "all") -> Dict[str, Any]:
    """Generates database designs, cloud tech stacks, and prioritized sprints."""
    log_event(
        AUDIT_TOOL_CALL,
        user_id=_get_active_user_id(),
        session_id=_get_active_session(),
        ip_address=_get_active_ip_address(),
        tool_name="DevOpsAgent",
        query=query
    )
    
    arch_result = {}
    action_result = []
    
    if request_type in ("architecture", "all"):
        raw_arch = await _llm_json(_ARCH_SYS, f"Wiki content:\n{wiki_context}\n\nRecommend architecture.")
        arch_result = json.loads(raw_arch)
        
    if request_type in ("sprint", "all"):
        raw_action = await _llm_json(_ACTION_SYS, f"Wiki content:\n{wiki_context}\n\nExtract action items.")
        action_result = json.loads(raw_action)
        
    return {
        "architecture": arch_result,
        "sprint_board": action_result
    }


# Agent D: CreatorAgent (Viral Media Strategist)
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
}"""

_TWEET_SYS = """\
You are a viral Twitter ghostwriter. Transform the document into an engaging, 5-part Twitter thread.
Respond with ONLY a valid JSON array of strings — no markdown fences:
["🧵 Part 1: ...", "Part 2: ...", "Part 3: ...", "Part 4: ...", "Part 5: ..."]"""

async def run_creator_agent(wiki_context: str, query: str, request_type: str = "all") -> Dict[str, Any]:
    """Generates video scripts with teleprompters and viral social feeds."""
    log_event(
        AUDIT_TOOL_CALL,
        user_id=_get_active_user_id(),
        session_id=_get_active_session(),
        ip_address=_get_active_ip_address(),
        tool_name="CreatorAgent",
        query=query
    )
    
    script_result = {}
    thread_result = []
    
    if request_type in ("script", "all"):
        raw_script = await _llm_json(_SCRIPT_SYS, f"Wiki content:\n{wiki_context}\n\nWrite creator script.")
        script_result = json.loads(raw_script)
        
    if request_type in ("tweets", "all"):
        raw_thread = await _llm_json(_TWEET_SYS, f"Wiki content:\n{wiki_context}\n\nWrite Twitter thread.")
        thread_result = json.loads(raw_thread)
        
    return {
        "creator_script": script_result,
        "tweet_thread": thread_result
    }


# Agent E: DocumentAgent (Knowledge Archivist)
_OBSIDIAN_SYS = """\
You are a technical documentarian. Transform the wiki content into a clean, professional Obsidian Markdown note.
Include frontmatter (YAML), headers, bullet points, and #tags.
Respond with ONLY a valid JSON object — no markdown fences:
{"filename": "note_name.md", "markdown": "# Title\\n\\n## Summary...\\n\\n#tags"}"""

async def run_document_agent(wiki_context: str, query: str) -> Dict[str, str]:
    """Generates Obsidian Markdown document vaults."""
    log_event(
        AUDIT_TOOL_CALL,
        user_id=_get_active_user_id(),
        session_id=_get_active_session(),
        ip_address=_get_active_ip_address(),
        tool_name="DocumentAgent",
        query=query
    )
    raw = await _llm_json(_OBSIDIAN_SYS, f"Wiki content:\n{wiki_context}\n\nGenerate Obsidian note.")
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Master Director / Orchestration Agent System Prompt
# ---------------------------------------------------------------------------

ORCHESTRATOR_SYSTEM_PROMPT = """You are Acumen Director, the master Orchestration Agent.
Your job is to read the user request and dynamically spawn specialized sub-agents to solve it.

You MUST decide which of these sub-agents to dynamically spawn:
- ResearchAgent: Always spawn this first to pull local RAG knowledge or run live DuckDuckGo searches.
- StudyAgent: Spawn this to generate high-retention Q&A study cards.
- DevOpsAgent: Spawn this to generate CTO tech stacks, database schemas, and prioritized sprint backlogs.
- CreatorAgent: Spawn this to write viral media copy (YouTube scripts and Twitter threads).
- DocumentAgent: Spawn this to format knowledge into professional Obsidian Markdown note files.

You can spawn MULTIPLE sub-agents if the user query is complex and requests multiple formats (e.g. study cards + database architecture).
You MUST respond with ONLY a valid JSON object — no markdown fences:
{
  "tactical_plan": "A concise, high-impact CTO planning comment (1-2 sentences) explaining which agents are dynamically spawned and why.",
  "spawn_agents": ["ResearchAgent", "StudyAgent", "DevOpsAgent", "CreatorAgent", "DocumentAgent"],
  "primary_intent": "general_rag|flashcards|architecture|action_items|creator_script|tweet_thread|obsidian_note|live_search|multi_task"
}
"""

# ---------------------------------------------------------------------------
# Public Swarm Entry Point
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# LangGraph Swarm Orchestration Workflow (P5.4)
# ---------------------------------------------------------------------------

class SwarmAgentState(TypedDict):
    session_id: str
    user_message: str
    search_query: Optional[str]
    history: List[Dict[str, str]]
    tactical_plan: Optional[str]
    spawn_agents: Optional[List[str]]
    intent: Optional[str]
    wiki_context: Optional[str]
    web_search: Optional[str]
    is_web_augmented: Optional[bool]
    agents_metadata: Optional[List[Dict[str, Any]]]
    sub_outputs: Optional[Dict[str, Any]]
    task_keys: Optional[List[str]]
    response: Optional[str]
    tool_used: Optional[str]
    tool_output: Any
    user_id: Optional[str]
    ip_address: Optional[str]


async def orchestrate_node(state: SwarmAgentState) -> Dict[str, Any]:
    _set_session(state["session_id"], user_id=state.get("user_id", ""), ip_address=state.get("ip_address", ""))
    
    user_message = state["user_message"]
    history = state.get("history") or []
    
    search_query = await rewrite_query(user_message, history)
    
    # Formulate recent chat sequence
    recent_chat = []
    for h in history:
        recent_chat.append(f"{h.get('role', 'user').upper()}: {h.get('content', '')}")
    recent_chat.append(f"USER: {user_message}")
    chat_block = "\n".join(recent_chat[-4:]) # Take last 4 turns
    
    plan_raw = await _llm_json(ORCHESTRATOR_SYSTEM_PROMPT, f"Chat Sequence:\n{chat_block}\n\nFormulate plan.")
    plan_data = json.loads(plan_raw)
    
    tactical_plan = plan_data.get("tactical_plan", "Spawning agents to analyze your query.")
    spawn_list = plan_data.get("spawn_agents", ["ResearchAgent"])
    intent = plan_data.get("primary_intent", "general_rag")
    
    if "ResearchAgent" not in spawn_list:
        spawn_list.insert(0, "ResearchAgent")
        
    logger.info("LangGraph Swarm Plan: %s (Intent: %s)", spawn_list, intent)
    return {
        "tactical_plan": tactical_plan,
        "spawn_agents": spawn_list,
        "intent": intent,
        "search_query": search_query
    }


async def execute_swarm_node(state: SwarmAgentState) -> Dict[str, Any]:
    _set_session(state["session_id"], user_id=state.get("user_id", ""), ip_address=state.get("ip_address", ""))
    
    search_query = state.get("search_query") or state["user_message"]
    spawn_list = state["spawn_agents"] or ["ResearchAgent"]
    intent = state["intent"] or "general_rag"
    user_message = state["user_message"]
    
    agents_metadata = []
    sub_tasks = []
    
    # First: execute ResearchAgent to get RAG context
    research_meta = {"name": "ResearchAgent", "role": "Semantic Context Auditor", "status": "executed", "icon": "Sparkles"}
    agents_metadata.append(research_meta)
    
    research_res = await run_research_agent(search_query)
    wiki_context = research_res["wiki_context"]
    web_search = research_res["web_search"]
    is_web_augmented = research_res["is_web_augmented"]
    
    task_keys = []
    
    if "StudyAgent" in spawn_list or intent in ("flashcards", "multi_task"):
        task_keys.append("StudyAgent")
        sub_tasks.append(run_study_agent(wiki_context, user_message))
        agents_metadata.append({"name": "StudyAgent", "role": "Cognitive Memory Specialist", "status": "executed", "icon": "BookOpen"})
        
    if "DevOpsAgent" in spawn_list or intent in ("architecture", "action_items", "multi_task"):
        task_keys.append("DevOpsAgent")
        devops_scope = "all"
        if intent == "architecture":
            devops_scope = "architecture"
        elif intent == "action_items":
            devops_scope = "sprint"
        sub_tasks.append(run_devops_agent(wiki_context, user_message, devops_scope))
        agents_metadata.append({"name": "DevOpsAgent", "role": "Cloud System Architect", "status": "executed", "icon": "Database"})
        
    if "CreatorAgent" in spawn_list or intent in ("creator_script", "tweet_thread", "multi_task"):
        task_keys.append("CreatorAgent")
        creator_scope = "all"
        if intent == "creator_script":
            creator_scope = "script"
        elif intent == "tweet_thread":
            creator_scope = "tweets"
        sub_tasks.append(run_creator_agent(wiki_context, user_message, creator_scope))
        agents_metadata.append({"name": "CreatorAgent", "role": "Viral Media Strategist", "status": "executed", "icon": "Play"})
        
    if "DocumentAgent" in spawn_list or intent in ("obsidian_note", "multi_task"):
        task_keys.append("DocumentAgent")
        sub_tasks.append(run_document_agent(wiki_context, user_message))
        agents_metadata.append({"name": "DocumentAgent", "role": "Knowledge Archivist", "status": "executed", "icon": "Server"})

    # Execute all spawned sub-agents in parallel
    results = await asyncio.gather(*sub_tasks)
    
    sub_outputs = {}
    sub_outputs["live_web_search"] = web_search if is_web_augmented else wiki_context
    
    for key, val in zip(task_keys, results):
        if key == "StudyAgent":
            sub_outputs["generate_flashcards"] = val
        elif key == "DevOpsAgent":
            if intent == "architecture":
                sub_outputs["architecture_assist"] = val["architecture"]
            elif intent == "action_items":
                sub_outputs["extract_action_items"] = val["sprint_board"]
            else:
                sub_outputs["architecture_assist"] = val["architecture"]
                sub_outputs["extract_action_items"] = val["sprint_board"]
        elif key == "CreatorAgent":
            if intent == "creator_script":
                sub_outputs["generate_creator_script"] = val["creator_script"]
            elif intent == "tweet_thread":
                sub_outputs["generate_tweet_thread"] = val["tweet_thread"]
            else:
                sub_outputs["generate_creator_script"] = val["creator_script"]
                sub_outputs["generate_tweet_thread"] = val["tweet_thread"]
        elif key == "DocumentAgent":
            sub_outputs["generate_obsidian_markdown"] = val

    return {
        "wiki_context": wiki_context,
        "web_search": web_search,
        "is_web_augmented": is_web_augmented,
        "agents_metadata": agents_metadata,
        "sub_outputs": sub_outputs,
        "task_keys": task_keys
    }


async def summarize_node(state: SwarmAgentState) -> Dict[str, Any]:
    _set_session(state["session_id"], user_id=state.get("user_id", ""), ip_address=state.get("ip_address", ""))
    
    agents_metadata = state["agents_metadata"] or []
    tactical_plan = state["tactical_plan"] or "Coordinating agents."
    wiki_context = state["wiki_context"] or ""
    sub_outputs = state["sub_outputs"] or {}
    task_keys = state.get("task_keys") or []
    intent = state["intent"] or "general_rag"
    web_search = state["web_search"] or ""
    is_web_augmented = state["is_web_augmented"] or False
    
    summary_prompt = (
        f"You are Acumen Director. A dynamic multi-agent swarm has completed executing tasks.\n"
        f"Agents executed: {[meta['name'] for meta in agents_metadata]}\n"
        f"Tactical Plan formulated: {tactical_plan}\n"
        f"Local wiki context: {wiki_context[:1000]}...\n\n"
        f"Write a concise, high-impact conversational summary (2-3 sentences) announcing the completion of the execution "
        f"and inviting the user to explore the results below. Address the user as 'you'."
    )
    
    summary_resp = await invoke_llm_with_fallback(
        [SystemMessage(content="You are a CTO summary coordinator. Be professional and intense."), HumanMessage(content=summary_prompt)],
        temperature=0.3,
        max_tokens=1024
    )
    summary_text = str(summary_resp.content).strip()
    
    # Consolidate unified payload
    tool_output = {
        "orchestrator_plan": tactical_plan,
        "agents_created": agents_metadata,
        "sub_outputs": sub_outputs
    }
    
    main_tool = None
    if len(task_keys) == 1:
        if task_keys[0] == "StudyAgent":
            main_tool = "generate_flashcards"
        elif task_keys[0] == "DevOpsAgent":
            main_tool = "architecture_assist" if intent == "architecture" else "extract_action_items"
        elif task_keys[0] == "CreatorAgent":
            main_tool = "generate_creator_script" if intent == "creator_script" else "generate_tweet_thread"
        elif task_keys[0] == "DocumentAgent":
            main_tool = "generate_obsidian_markdown"
    else:
        main_tool = "multi_agent_orchestration"
        
    tool_output_val = tool_output if main_tool == "multi_agent_orchestration" else (
        sub_outputs.get("generate_flashcards") or 
        sub_outputs.get("architecture_assist") or 
        sub_outputs.get("extract_action_items") or 
        sub_outputs.get("generate_creator_script") or 
        sub_outputs.get("generate_tweet_thread") or 
        sub_outputs.get("generate_obsidian_markdown") or 
        web_search
    )
    
    # Append to memory history
    new_history = list(state.get("history") or [])
    new_history.append({"role": "user", "content": state["user_message"]})
    
    assistant_msg = {"role": "assistant", "content": summary_text}
    if main_tool:
        assistant_msg["toolUsed"] = main_tool
        assistant_msg["toolOutput"] = tool_output_val
    assistant_msg["isWebAugmented"] = is_web_augmented
    new_history.append(assistant_msg)
    
    # Non-blocking real-time background evaluation of faithfulness and relevancy via Ragas
    try:
        from engine.observability import evaluate_rag_turn
        asyncio.create_task(evaluate_rag_turn(
            query=state["user_message"],
            response=summary_text,
            context=wiki_context
        ))
    except Exception as eval_err:
        logger.warning("Failed to schedule background RAG evaluation: %s", eval_err)
        
    logger.info("LangGraph Swarm complete. Main Tool: %s", main_tool)
    return {
        "response": summary_text,
        "tool_used": main_tool,
        "tool_output": tool_output_val,
        "history": new_history
    }


DB_PATH = os.path.join(os.getenv("ACUMEN_DATA_DIR", "./data"), "acumen.db")
_agent_graph = None

def get_agent_graph():
    global _agent_graph
    if _agent_graph is None:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        checkpointer = SqliteSaver(conn)
        
        workflow = StateGraph(SwarmAgentState)
        workflow.add_node("orchestrate", orchestrate_node)
        workflow.add_node("execute_swarm", execute_swarm_node)
        workflow.add_node("summarize", summarize_node)
        
        workflow.set_entry_point("orchestrate")
        workflow.add_edge("orchestrate", "execute_swarm")
        workflow.add_edge("execute_swarm", "summarize")
        workflow.add_edge("summarize", END)
        
        _agent_graph = workflow.compile(checkpointer=checkpointer)
        logger.info("Compiled LangGraph checkpointer workflow.")
    return _agent_graph


# ---------------------------------------------------------------------------
# Public Swarm Entry Point
# ---------------------------------------------------------------------------

async def run_agent_chat(
    session_id: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
    user_id: str = "",
    ip_address: str = "",
) -> Dict[str, Any]:
    """
    Run the Hierarchical Swarm using LangGraph StateGraph and persistent SqliteSaver checkpoint memory.
    """
    logger.info("Hierarchical Swarm via LangGraph | session=%s | '%s'", session_id, user_message[:80])
    
    _set_session(session_id, user_id=user_id, ip_address=ip_address)
    
    graph = get_agent_graph()
    config = {"configurable": {"thread_id": session_id}}
    
    # Retrieve existing state
    state_info = graph.get_state(config)
    accumulated_history = []
    
    if state_info and state_info.values and state_info.values.get("history"):
        accumulated_history = state_info.values["history"]
        logger.info("Loaded %d chat memory turns from SqliteSaver.", len(accumulated_history))
    else:
        # Pre-populate using frontend history for backward compatibility or first turn
        accumulated_history = history or []
        logger.info("Initialized memory checkpointer with %d frontend turns.", len(accumulated_history))
        
    initial_state = {
        "session_id": session_id,
        "user_message": user_message,
        "history": accumulated_history,
        "user_id": user_id,
        "ip_address": ip_address
    }
    
    final_state = await graph.ainvoke(initial_state, config=config)
    
    return {
        "response": final_state["response"],
        "tool_used": final_state["tool_used"],
        "tool_output": final_state["tool_output"],
        "is_web_augmented": final_state["is_web_augmented"]
    }
