"""
engine/sanitizer.py — Prompt Injection Defense (OWASP LLM01)

Sanitizes all user-supplied chat messages before they reach the LLM to prevent
prompt injection attacks that could override system instructions, leak context
windows, or trigger unauthorized tool calls.
"""

import re
import logging

logger = logging.getLogger("acumen.sanitizer")

# ── Injection Pattern Registry ───────────────────────────────────────────────
# Patterns that attempt to override the system prompt or hijack the LLM.
# Ordered from most severe to least severe.
_INJECTION_PATTERNS: list[tuple[str, str]] = [
    # Direct instruction override attempts
    (r"ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?|context)",
     "instruction-override"),
    (r"(forget|disregard|override)\s+(everything|all|your)\s*(instructions?|rules?|context|training)?",
     "instruction-override"),
    # Role-play escape attempts
    (r"you\s+are\s+now\s+(a\s+)?(?!acumen|the\s+assistant).{0,40}(assistant|bot|AI|model|GPT|LLM)",
     "role-escape"),
    (r"pretend\s+(you\s+are|to\s+be)\s+(?!acumen).{0,60}",
     "role-escape"),
    (r"act\s+as\s+(if\s+you\s+(are|were)\s+)?(?!acumen).{0,60}(no\s+restrictions?|unfiltered|DAN)",
     "role-escape"),
    # System prompt exfiltration
    (r"(print|repeat|show|reveal|display|tell\s+me)\s+(your\s+)?(system\s+prompt|instructions?|context|rules?)",
     "exfiltration"),
    (r"what\s+(are|is)\s+your\s+(system\s+prompt|instructions?|hidden\s+prompt)",
     "exfiltration"),
    # Jailbreak templates
    (r"\bDAN\b",
     "jailbreak"),
    (r"(do\s+anything\s+now|jailbreak|jail\s*break)",
     "jailbreak"),
    (r"<\s*(system|assistant|user)\s*>",
     "delimiter-injection"),
    (r"\[\s*(INST|SYS|SYSTEM|HUMAN)\s*\]",
     "delimiter-injection"),
    # Prompt chaining attacks
    (r"---+\s*(new\s+)?instruction",
     "chaining"),
    (r"##+\s*(system|assistant|override)",
     "chaining"),
]

_COMPILED_PATTERNS = [
    (re.compile(pattern, re.IGNORECASE | re.DOTALL), category)
    for pattern, category in _INJECTION_PATTERNS
]

# Max input length (characters) to prevent token exhaustion attacks
MAX_INPUT_LENGTH = 4000


def sanitize_chat_input(text: str, user_id: str | None = None) -> tuple[str, list[str]]:
    """
    Sanitize a user chat message for prompt injection patterns.

    Returns:
        (sanitized_text, warnings): cleaned text and list of detected violation categories.

    The sanitized text has injection sequences redacted. Warnings are logged
    for audit purposes. A non-empty warnings list does NOT block the request —
    it signals to the caller that the response should be treated with caution.
    """
    if not text or not text.strip():
        return text, []

    # Length guard
    if len(text) > MAX_INPUT_LENGTH:
        logger.warning(
            "Input truncated",
            extra={"user_id": user_id, "original_length": len(text), "limit": MAX_INPUT_LENGTH}
        )
        text = text[:MAX_INPUT_LENGTH]

    warnings: list[str] = []
    sanitized = text

    for pattern, category in _COMPILED_PATTERNS:
        match = pattern.search(sanitized)
        if match:
            warnings.append(category)
            # Redact the matched segment
            sanitized = pattern.sub(f"[REDACTED:{category}]", sanitized)
            logger.warning(
                "Prompt injection attempt detected",
                extra={
                    "user_id": user_id,
                    "category": category,
                    "matched": match.group(0)[:80],  # log first 80 chars only
                }
            )

    return sanitized, warnings


def is_safe_url(url: str) -> bool:
    """
    Basic URL safety check for uploaded URLs.
    Blocks SSRF attempts targeting internal network ranges.
    """
    import urllib.parse
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False

    # Must be http or https
    if parsed.scheme not in ("http", "https"):
        return False

    host = parsed.hostname or ""

    # Block localhost and loopback
    if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return False

    # Block RFC-1918 private ranges (simple string prefix check)
    private_prefixes = ("10.", "192.168.", "172.16.", "172.17.", "172.18.",
                        "172.19.", "172.20.", "172.21.", "172.22.", "172.23.",
                        "172.24.", "172.25.", "172.26.", "172.27.", "172.28.",
                        "172.29.", "172.30.", "172.31.")
    if any(host.startswith(p) for p in private_prefixes):
        return False

    # Block link-local
    if host.startswith("169.254."):
        return False

    return True
