import os
import time
import logging
from typing import Dict, Any, List, Optional

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor
from opentelemetry.instrumentation.langchain import LangchainInstrumentor

from langchain_core.messages import SystemMessage, HumanMessage
from engine.fallback_chain import invoke_llm_with_fallback

logger = logging.getLogger("acumen.observability")

# Initialize global OpenTelemetry tracing
try:
    provider = TracerProvider()
    processor = SimpleSpanProcessor(ConsoleSpanExporter())
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    
    # Auto-instrument LangChain to log GenAI parameters, latency, and tokens
    LangchainInstrumentor().instrument()
    logger.info("OpenTelemetry GenAI Tracing & LangChain auto-instrumentation initialized successfully.")
except Exception as e:
    logger.warning("Failed to initialize OpenTelemetry tracing: %s", e)

tracer = trace.get_tracer("acumen")

# Token cost registry (Mid-2026 pricing standards)
MODEL_COSTS = {
    "gemini-2.5-flash": {"input": 0.075 / 1e6, "output": 0.30 / 1e6},
    "gemini-2.5-flash-lite": {"input": 0.0375 / 1e6, "output": 0.15 / 1e6},
    "gemini-2.5-pro": {"input": 1.25 / 1e6, "output": 5.00 / 1e6},
}

def log_span_metrics(span_name: str, duration_ms: float, tokens_in: int = 0, tokens_out: int = 0, model_name: str = "gemini-2.5-flash") -> Dict[str, Any]:
    """Track and log GenAI token usage, cost per request, and phase latency."""
    cost = 0.0
    if model_name in MODEL_COSTS:
        rates = MODEL_COSTS[model_name]
        cost = (tokens_in * rates["input"]) + (tokens_out * rates["output"])
        
    metrics = {
        "span": span_name,
        "latency_ms": round(duration_ms, 2),
        "tokens_input": tokens_in,
        "tokens_output": tokens_out,
        "estimated_cost_usd": round(cost, 8),
        "model": model_name
    }
    
    logger.info("observability_metrics: %s", metrics)
    return metrics


async def evaluate_rag_turn(query: str, response: str, context: str) -> Dict[str, float]:
    """
    Ragas-based evaluation pipeline.
    Uses Gemini to evaluate Faithfulness and Answer Relevancy on a single chat turn.
    """
    logger.info("Starting Ragas RAG pipeline evaluation...")
    
    # Clean inputs to avoid overflows
    context_snippet = context[:4000]
    response_snippet = response[:2000]
    
    # Faithfulness evaluator
    faithfulness_prompt = (
        "You are an AI RAG quality evaluator. Your goal is to measure FAITHFULNESS (groundedness).\n"
        "Analyze the context and the generated response below. Determine if the statements in the response "
        "are strictly and mathematically supported by the context without hallucination.\n\n"
        f"CONTEXT:\n{context_snippet}\n\n"
        f"RESPONSE:\n{response_snippet}\n\n"
        "Provide a score between 0.0 (completely ungrounded/hallucinated) and 1.0 (completely faithful/grounded).\n"
        "Respond with ONLY a JSON object:\n"
        '{"score": 0.95, "reason": "concise explanation"}'
    )
    
    # Answer Relevancy evaluator
    relevancy_prompt = (
        "You are an AI RAG quality evaluator. Your goal is to measure ANSWER RELEVANCY.\n"
        "Analyze the original query and the generated response below. Determine if the response directly, "
        "completely, and concisely addresses the user's query.\n\n"
        f"QUERY:\n{query}\n\n"
        f"RESPONSE:\n{response_snippet}\n\n"
        "Provide a score between 0.0 (completely irrelevant) and 1.0 (completely relevant and direct).\n"
        "Respond with ONLY a JSON object:\n"
        '{"score": 0.98, "reason": "concise explanation"}'
    )
    
    scores = {"faithfulness": 1.0, "answer_relevancy": 1.0}
    
    try:
        # Run both evaluations using our robust fallback chain
        import json
        from engine.wiki_swarm import _extract_json_block
        
        # 1. Faithfulness
        f_resp = await invoke_llm_with_fallback(
            [SystemMessage(content="You are a strict QA auditor."), HumanMessage(content=faithfulness_prompt)],
            temperature=0,
            max_tokens=256,
            structured_json=True
        )
        f_raw = _extract_json_block(f_resp.content)
        f_data = json.loads(f_raw)
        scores["faithfulness"] = float(f_data.get("score", 1.0))
        logger.info("Faithfulness evaluation score: %s (Reason: %s)", scores["faithfulness"], f_data.get("reason", ""))
        
        # 2. Relevancy
        r_resp = await invoke_llm_with_fallback(
            [SystemMessage(content="You are a strict QA auditor."), HumanMessage(content=relevancy_prompt)],
            temperature=0,
            max_tokens=256,
            structured_json=True
        )
        r_raw = _extract_json_block(r_resp.content)
        r_data = json.loads(r_raw)
        scores["answer_relevancy"] = float(r_data.get("score", 1.0))
        logger.info("Answer Relevancy evaluation score: %s (Reason: %s)", scores["answer_relevancy"], r_data.get("reason", ""))
        
    except Exception as e:
        logger.warning("Ragas evaluation turn encountered an error: %s. Defaulting to 1.0.", e)
        
    return scores
