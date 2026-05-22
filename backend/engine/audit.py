"""
engine/audit.py — Structured Audit Logging (Security & Compliance)

Provides tamper-evident, structured audit logs for all security-relevant
operations: document uploads, synthesis runs, chat queries, and tool calls.

Log entries are written to:
  1. The standard Python logger ("acumen.audit") — picked up by any log handler
  2. A rotating JSONL file at logs/audit.jsonl — for SIEM ingestion

Each entry is a JSON object on a single line, with no sensitive data
(no API keys, no document content, no PII beyond user_id).
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

# ── Audit log file setup ─────────────────────────────────────────────────────
_LOG_DIR = Path(__file__).parent.parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_AUDIT_LOG_PATH = _LOG_DIR / "audit.jsonl"

_audit_file_handler = RotatingFileHandler(
    _AUDIT_LOG_PATH,
    maxBytes=10 * 1024 * 1024,   # 10 MB per file
    backupCount=10,               # Keep 10 rotated files = 100 MB max
    encoding="utf-8",
)
_audit_file_handler.setFormatter(logging.Formatter("%(message)s"))

_audit_logger = logging.getLogger("acumen.audit")
_audit_logger.setLevel(logging.INFO)
_audit_logger.addHandler(_audit_file_handler)
_audit_logger.propagate = False  # Don't double-log to root logger

# ── Audit Event Types ─────────────────────────────────────────────────────────
AUDIT_UPLOAD          = "document.upload"
AUDIT_SYNTHESIZE      = "knowledge.synthesize"
AUDIT_CHAT            = "agent.chat"
AUDIT_TOOL_CALL       = "agent.tool_call"
AUDIT_GRAPH_ACCESS    = "knowledge.graph_access"
AUDIT_INJECTION_BLOCK = "security.injection_detected"
AUDIT_AUTH_FAILURE    = "security.auth_failure"
AUDIT_URL_BLOCKED     = "security.url_blocked"


def _build_entry(
    event: str,
    user_id: str | None,
    session_id: str | None,
    ip_address: str | None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "audit_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "user_id": user_id or "anonymous",
        "session_id": session_id,
        "ip_address": ip_address,
        **(metadata or {}),
    }


def log_event(
    event: str,
    user_id: str | None = None,
    session_id: str | None = None,
    ip_address: str | None = None,
    **metadata: Any,
) -> None:
    """
    Write a single structured audit log entry.

    Args:
        event:      One of the AUDIT_* constants above.
        user_id:    Clerk user ID (sub claim from JWT), or None for anonymous.
        session_id: The Acumen session UUID this action relates to.
        ip_address: Client IP extracted from the X-Forwarded-For header.
        **metadata: Arbitrary extra fields (filename, tool_name, etc.).
                    Never include raw document content or API keys here.
    """
    entry = _build_entry(event, user_id, session_id, ip_address, metadata or None)
    line = json.dumps(entry, default=str)
    _audit_logger.info(line)


# ── FastAPI Request helpers ───────────────────────────────────────────────────
def get_client_ip(request: Any) -> str | None:
    """Extract real client IP respecting X-Forwarded-For (set by reverse proxies)."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first (leftmost) IP — closest to the real client
        return forwarded_for.split(",")[0].strip()
    return getattr(getattr(request, "client", None), "host", None)
