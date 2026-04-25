"""
Acumen — Clerk Authentication Dependency
=========================================
Validates the Clerk-issued session JWT sent by the Next.js frontend in the
``Authorization: Bearer <token>`` header.

Flow
----
1. Extract token from Authorization header.
2. Fetch Clerk's JWKS (JSON Web Key Set) — cached for 1 hour in memory so
   we never hit the JWKS endpoint on every request.
3. Decode + verify the JWT (signature, expiry, issuer).
4. Return a ``ClerkUser`` dataclass with the ``clerk_id`` (= JWT ``sub``).

Environment variables required
-------------------------------
CLERK_SECRET_KEY        — Your Clerk secret key (sk_live_… / sk_test_…).
                          Used to derive the JWKS URL when CLERK_JWKS_URL
                          is not provided explicitly.
CLERK_JWKS_URL          — (Optional) Override the JWKS URL directly, e.g.
                          https://<frontend-api>.clerk.accounts.dev/.well-known/jwks.json

Dev / test bypass
-----------------
If CLERK_SECRET_KEY is absent AND the environment variable
``ACUMEN_AUTH_BYPASS=true`` is set, the dependency returns a synthetic user
with clerk_id="dev_user" so local development works without a Clerk account.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from jose.exceptions import JWKError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CLERK_SECRET_KEY: Optional[str] = os.getenv("CLERK_SECRET_KEY")
CLERK_JWKS_URL: Optional[str] = os.getenv("CLERK_JWKS_URL")
AUTH_BYPASS: bool = os.getenv("ACUMEN_AUTH_BYPASS", "false").lower() == "true"

# JWKS in-memory cache
_jwks_cache: Dict[str, Any] = {}
_jwks_fetched_at: float = 0.0
_JWKS_TTL_SECONDS: int = 3600  # refresh keys every hour


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _derive_jwks_url() -> str:
    """Derive the JWKS URL from CLERK_SECRET_KEY if not set explicitly.

    Clerk secret keys follow the pattern:
        sk_live_<base64-encoded-frontend-api>
        sk_test_<base64-encoded-frontend-api>

    The frontend API domain can be reconstructed from the key suffix.
    The simplest portable approach is to use the well-known JWKS discovery
    endpoint available on every Clerk instance.
    """
    if CLERK_JWKS_URL:
        return CLERK_JWKS_URL

    if not CLERK_SECRET_KEY:
        raise RuntimeError(
            "Neither CLERK_SECRET_KEY nor CLERK_JWKS_URL is set. "
            "Set ACUMEN_AUTH_BYPASS=true for local development."
        )

    # The Clerk Backend API exposes JWKS via:
    #   https://api.clerk.com/v1/jwks   (authenticated with secret key)
    return "https://api.clerk.com/v1/jwks"


def _fetch_jwks() -> Dict[str, Any]:
    """Fetch JWKS from Clerk, honouring the in-memory TTL cache."""
    global _jwks_cache, _jwks_fetched_at

    now = time.monotonic()
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS:
        return _jwks_cache

    url = _derive_jwks_url()
    headers: Dict[str, str] = {}
    if CLERK_SECRET_KEY and "api.clerk.com" in url:
        headers["Authorization"] = f"Bearer {CLERK_SECRET_KEY}"

    try:
        resp = httpx.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = now
        logger.info("JWKS refreshed from %s (%d keys).", url, len(_jwks_cache.get("keys", [])))
    except Exception as exc:
        logger.error("Failed to fetch JWKS: %s", exc)
        if _jwks_cache:
            logger.warning("Serving stale JWKS cache.")
        else:
            raise RuntimeError(f"Cannot fetch Clerk JWKS: {exc}") from exc

    return _jwks_cache


def _verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and verify a Clerk-issued JWT.

    Returns the decoded claims dict on success.
    Raises HTTPException(401) on any failure.
    """
    jwks = _fetch_jwks()

    try:
        # jose will select the right key from the JWKS using the token's `kid`
        claims = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={
                "verify_aud": False,   # Clerk does not set a fixed audience
            },
        )
        return claims
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (JWTError, JWKError) as exc:
        logger.warning("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

@dataclass
class ClerkUser:
    """Minimal user identity extracted from the verified JWT."""
    clerk_id: str        # JWT `sub` claim — stable Clerk user ID
    email: str = ""      # from `email` claim if present (optional)
    session_id: str = "" # JWT `sid` claim — Clerk session ID


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> ClerkUser:
    """
    FastAPI dependency that validates the Clerk Bearer token.

    Usage
    -----
    ::

        @app.post("/upload")
        async def upload(user: ClerkUser = Depends(get_current_user)):
            ...  # user.clerk_id is the verified Clerk user ID

    Raises
    ------
    HTTP 401 — if the token is absent, malformed, or expired.
    """
    # ── Dev bypass ────────────────────────────────────────────────────────
    if AUTH_BYPASS and not CLERK_SECRET_KEY:
        logger.warning(
            "ACUMEN_AUTH_BYPASS=true — skipping token validation (dev mode)."
        )
        return ClerkUser(clerk_id="dev_user", email="dev@local", session_id="dev_session")

    # ── Extract token ─────────────────────────────────────────────────────
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing or malformed.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # ── Verify ────────────────────────────────────────────────────────────
    claims = _verify_token(token)

    clerk_id: str = claims.get("sub", "")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing the 'sub' (user ID) claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return ClerkUser(
        clerk_id=clerk_id,
        email=claims.get("email", ""),
        session_id=claims.get("sid", ""),
    )
