import os
import json
import logging
from typing import List, Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from engine.wiki_swarm import get_wiki_collection
from engine.fallback_chain import invoke_llm_with_fallback

logger = logging.getLogger("acumen.artifact_generator")

def get_notebook_wiki_content(session_id: str) -> str:
    """Retrieve all synthesized Wiki pages for the session and compile them into a unified outline."""
    collection = get_wiki_collection()
    results = collection.get(where={"session_id": session_id})
    
    if not results or not results.get("documents"):
        # Let's fallback to retrieving raw leaf chunks if no wiki page has been synthesized yet
        from engine.vector_store import get_vector_store
        vector_store = get_vector_store()
        chunks_res = vector_store.get(
            collection_name="acumen_chunks",
            where={"session_id": session_id, "raptor_level": 0}
        )
        if chunks_res and chunks_res.get("documents"):
            return "\n\n".join(chunks_res["documents"][:10]) # Take first 10 leaf chunks
        raise ValueError(f"No synthesized wiki data or chunks found for session {session_id}")
        
    compiled_wiki = []
    for doc_json in results["documents"]:
        try:
            page = json.loads(doc_json)
            title = page.get("topic_title", "Untitled Topic")
            summary = page.get("summary", "")
            key_terms = ", ".join(page.get("key_terms", []))
            insights = "\n".join([f"- {ins}" for ins in page.get("insights", [])])
            
            section = f"### Topic: {title}\n**Summary:** {summary}\n**Key Terms:** {key_terms}\n**Key Takeaways:**\n{insights}"
            compiled_wiki.append(section)
        except Exception as e:
            logger.warning("Failed to parse wiki page doc: %s", e)
            compiled_wiki.append(doc_json)
            
    return "\n\n---\n\n".join(compiled_wiki)

async def generate_faq(session_id: str) -> str:
    """Generate a high-quality FAQ markdown document."""
    content = get_notebook_wiki_content(session_id)
    
    system_prompt = """You are an elite research analyst and educator.
    Based on the provided research topics, generate a high-quality, comprehensive FAQ (Frequently Asked Questions) document.
    Structure the FAQ into logical categories if necessary. For each question, provide a detailed, accurate, and deeply cited answer based on the context.
    Do NOT include generic placeholders. Use professional markdown, bolding, and clear spacing. Output ONLY the markdown document."""
    
    resp = await invoke_llm_with_fallback(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Synthesized Wiki Topics:\n\n{content}")
        ],
        temperature=0.3,
        max_tokens=2048
    )
    
    return str(resp.content).strip()

async def generate_study_guide(session_id: str) -> str:
    """Generate a high-quality Study Guide markdown document."""
    content = get_notebook_wiki_content(session_id)
    
    system_prompt = """You are a world-class academic tutor.
    Based on the provided research topics, generate a premium, structured Study Guide.
    The Study Guide MUST include:
    1. **Executive Overview**: A high-level introduction to the material.
    2. **Glossary of Key Terms**: A definition list of all technical terminology and key concepts.
    3. **Core Themes Deep-Dive**: Detailed explanations of the primary research themes.
    4. **Practice Questions**: 5-10 challenging conceptual study/essay questions with comprehensive suggested answer rubrics.
    5. **Essay Prompt**: A highly engaging research question for further study.
    
    Use beautiful glassmorphic-friendly markdown layouts. Output ONLY the markdown document."""
    
    resp = await invoke_llm_with_fallback(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Synthesized Wiki Topics:\n\n{content}")
        ],
        temperature=0.3,
        max_tokens=2048
    )
    
    return str(resp.content).strip()

async def generate_briefing(session_id: str) -> str:
    """Generate an executive briefing document."""
    content = get_notebook_wiki_content(session_id)
    
    system_prompt = """You are a senior chief-of-staff and business intelligence consultant.
    Generate a highly strategic, professional Executive Briefing Document based on the provided research material.
    Include sections for:
    1. **Context & Background**: The high-level scenario and environment.
    2. **Core Arguments & Claims**: What the source documents argue.
    3. **Key Findings & Evidence**: Concrete data, discoveries, or technical insights.
    4. **Strategic Implications**: Why this matters for decision-makers in 2026.
    5. **Actionable Recommendations**: Next steps or recommendations derived from the insights.
    
    Output ONLY clean, executive-ready markdown."""
    
    resp = await invoke_llm_with_fallback(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Synthesized Wiki Topics:\n\n{content}")
        ],
        temperature=0.2,
        max_tokens=2048
    )
    
    return str(resp.content).strip()

async def generate_timeline(session_id: str) -> str:
    """Generate a chronological timeline of key events or dates."""
    content = get_notebook_wiki_content(session_id)
    
    system_prompt = """You are a detailed scientific historian.
    Analyze the provided research material and build a chronological Timeline of key events, historical dates, breakthroughs, publications, or milestone dates mentioned in the text.
    If exact dates are missing, organize the timeline by conceptual sequence, process phases, or logical steps.
    Format each timeline milestone as a clean markdown section:
    ### [Year/Date/Phase] — [Short Action Title]
    - **Context:** Detailed historical background of this event.
    - **Key Players/Technologies:** Relevant entities involved.
    - **Downstream Impact:** How this event influenced subsequent milestones.
    
    Output ONLY clean, beautiful markdown timeline representation."""
    
    resp = await invoke_llm_with_fallback(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Synthesized Wiki Topics:\n\n{content}")
        ],
        temperature=0.3,
        max_tokens=2048
    )
    
    return str(resp.content).strip()

async def generate_mindmap(session_id: str) -> Dict[str, Any]:
    """Generate a structural JSON mindmap of the session concepts."""
    content = get_notebook_wiki_content(session_id)
    
    system_prompt = """You are a visual knowledge architect.
    Based on the provided research topics, construct a hierarchical semantic mindmap of the material.
    You MUST output valid, parseable JSON conforming EXACTLY to the following schema:
    {
      "name": "Central Concept Name",
      "children": [
        {
          "name": "Sub-theme Name",
          "children": [
            { "name": "Key Point / Insight 1" },
            { "name": "Key Point / Insight 2" }
          ]
        },
        ...
      ]
    }
    Include at least 3 main sub-themes, each with 2-4 key points/insights.
    Return ONLY raw JSON, with no markdown code blocks, brackets, or preambles.
    Ensure response is strictly parseable as standard JSON."""
    
    resp = await invoke_llm_with_fallback(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Synthesized Wiki Topics:\n\n{content}")
        ],
        temperature=0.4,
        max_tokens=2048,
        structured_json=True
    )
    
    try:
        raw_text = str(resp.content).strip()
        data = json.loads(raw_text)
        return data
    except Exception as e:
        logger.error("Failed to parse generated mindmap as JSON: %s. Returning fallback.", e)
        # Safe fallback mindmap structure
        return {
            "name": "Document Overview",
            "children": [
                {
                  "name": "Main Insights",
                  "children": [{"name": "Check synthesized Wiki tabs for details."}]
                }
            ]
        }
