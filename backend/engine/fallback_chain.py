import os
import logging
from typing import List, Dict, Any, Union
from langchain_core.messages import BaseMessage
from langchain_google_genai import ChatGoogleGenerativeAI

logger = logging.getLogger("acumen.fallback_chain")

def get_fallback_model_list() -> List[str]:
    """Retrieve fallback sequence order, respecting primary model overrides."""
    primary = os.getenv("ACUMEN_LLM_MODEL", "gemini-2.5-flash")
    fallbacks = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]
    if primary in fallbacks:
        fallbacks.remove(primary)
        fallbacks.insert(0, primary)
    return fallbacks

async def invoke_llm_with_fallback(
    messages: List[BaseMessage],
    temperature: float = 0.2,
    max_tokens: int = 1024,
    structured_json: bool = False
) -> Any:
    """
    Asynchronously invokes the LangChain Gemini LLM client,
    shifting dynamically to next fallback targets on failure.
    """
    models = get_fallback_model_list()
    last_error = None

    for model_name in models:
        try:
            logger.info("Attempting LLM invoke using model: %s", model_name)
            model_kwargs = {}
            if structured_json:
                model_kwargs["response_mime_type"] = "application/json"

            llm = ChatGoogleGenerativeAI(
                model=model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                model_kwargs=model_kwargs
            )
            resp = await llm.ainvoke(messages)
            return resp
        except Exception as e:
            last_error = e
            logger.warning("Model %s invocation failed: %s. Trying next fallback target...", model_name, e)
            continue

    logger.error("All models in the ACUMEN fallback chain exhausted.")
    raise last_error

def get_sync_llm_with_fallback(
    temperature: float = 0.2,
    max_tokens: int = 1024,
    structured_json: bool = False
) -> ChatGoogleGenerativeAI:
    """
    Synchronously returns a ChatGoogleGenerativeAI client 
    by resolving connectivity across active fallback targets.
    """
    models = get_fallback_model_list()
    for model_name in models:
        try:
            model_kwargs = {}
            if structured_json:
                model_kwargs["response_mime_type"] = "application/json"

            llm = ChatGoogleGenerativeAI(
                model=model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                model_kwargs=model_kwargs
            )
            return llm
        except Exception:
            continue
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash", 
        temperature=temperature, 
        max_tokens=max_tokens
    )
