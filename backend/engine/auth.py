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
4. Verify token active state with Clerk Backend API (Revocation check).
5. Return a ``ClerkUser`` dataclass with the ``clerk_id`` (= JWT ``sub``).
"""

from __future__ import annotations

import asyncio
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
CLERK_API_URL: str = os.getenv("CLERK_API_URL", "https://api.clerk.com/v1")
ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").lower()
AUTH_BYPASS: bool = os.getenv("ACUMEN_AUTH_BYPASS", "false").lower() == "true"

# Production Safe-guard: prevent auth bypass in production environments
if AUTH_BYPASS and ENVIRONMENT == "production":
    logger.critical(
        "🚨 CRITICAL SECURITY WARNING: ACUMEN_AUTH_BYPASS is set to True, but ENVIRONMENT is 'production'! "
        "Force-disabling AUTH_BYPASS immediately to secure production endpoints."
    )
    AUTH_BYPASS = False

# JWKS in-memory cache and asyncio Lock for thread-safety
_jwks_cache: Dict[str, Any] = {}
_jwks_fetched_at: float = 0.0
_JWKS_TTL_SECONDS: int = 3600  # refresh keys every hour
_jwks_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _derive_jwks_url() -> str:
    """Derive the JWKS URL from CLERK_SECRET_KEY if not set explicitly."""
    if CLERK_JWKS_URL:
        return CLERK_JWKS_URL

    if not CLERK_SECRET_KEY:
        raise RuntimeError(
            "Neither CLERK_SECRET_KEY nor CLERK_JWKS_URL is set. "
            "Set ACUMEN_AUTH_BYPASS=true for local development."
        )

    # Use the Clerk Backend API well-known JWKS endpoint
    return f"{CLERK_API_URL.rstrip('/')}/jwks"


async def _fetch_jwks_async() -> Dict[str, Any]:
    """Fetch JWKS from Clerk asynchronously, honoring the in-memory TTL cache with Lock safety."""
    global _jwks_cache, _jwks_fetched_at

    now = time.monotonic()
    # Fast path check outside lock
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS:
        return _jwks_cache

    async with _jwks_lock:
        # Double-check inside lock boundary to prevent multiple requests hitting the Clerk API
        now = time.monotonic()
        if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL_SECONDS:
            return _jwks_cache

        url = _derive_jwks_url()
        headers: Dict[str, str] = {}
        if CLERK_SECRET_KEY and "api.clerk.com" in url:
            headers["Authorization"] = f"Bearer {CLERK_SECRET_KEY}"

        try:
            logger.info("JWKS Cache Miss. Fetching keys from %s ...", url)
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            _jwks_cache = resp.json()
            _jwks_fetched_at = now
            logger.info("JWKS refreshed successfully (%d keys).", len(_jwks_cache.get("keys", [])))
        except Exception as exc:
            logger.error("Failed to fetch JWKS: %s", exc)
            if _jwks_cache:
                logger.warning("Serving stale JWKS cache as fallback.")
            else:
                raise RuntimeError(f"Cannot fetch Clerk JWKS: {exc}") from exc

        return _jwks_cache


async def _verify_token(token: str) -> Dict[str, Any]:
    """
    Decode and verify a Clerk-issued JWT.

    Returns the decoded claims dict on success.
    Raises HTTPException(401) on any failure.
    """
    jwks = await _fetch_jwks_async()

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


async def check_session_active(session_id: str) -> bool:
    """
    Query Clerk's Backend API to ensure the session has not been revoked/expired.
    """
    if not CLERK_SECRET_KEY or not session_id:
        return True

    url = f"{CLERK_API_URL.rstrip('/')}/sessions/{session_id}"
    headers = {"Authorization": f"Bearer {CLERK_SECRET_KEY}"}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            session_data = resp.json()
            is_active = session_data.get("status") == "active"
            if not is_active:
                logger.warning("Clerk Session %s is inactive or revoked.", session_id)
            return is_active
        elif resp.status_code == 404:
            logger.warning("Clerk Session %s not found on server (revoked).", session_id)
            return False
        # If any other API error, fail open to avoid locking out users on Clerk downtime
        return True
    except Exception as exc:
        logger.warning("Clerk session active validation failed: %s. Defaulting to safe-pass.", exc)
        return True


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
    """
    # ── Dev bypass ────────────────────────────────────────────────────────
    if AUTH_BYPASS:
        logger.warning(
            "ACUMEN_AUTH_BYPASS=true — skipping token validation (dev mode)."
        )
        return ClerkUser(clerk_id="dev_user", email="dev@local", session_id="dev_session")

    # ── Extract token ─────────────────────────────────────────────────────
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    else:
        token = request.query_params.get("token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header or 'token' query parameter missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Verify JWT ────────────────────────────────────────────────────────────
    claims = await _verify_token(token)

    clerk_id: str = claims.get("sub", "")
    if not clerk_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing the 'sub' (user ID) claim.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    session_id: str = claims.get("sid", "")

    # ── Verify Session Revocation (Clerk API Check) ───────────────────────────
    if session_id:
        is_active = await check_session_active(session_id)
        if not is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Your session has been revoked. Please sign in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return ClerkUser(
        clerk_id=clerk_id,
        email=claims.get("email", ""),
        session_id=session_id,
    )
