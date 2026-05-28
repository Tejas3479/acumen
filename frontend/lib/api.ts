// Acumen — API client (all backend calls in one place)
// BASE is set via NEXT_PUBLIC_BACKEND_URL in .env.local
// Falls back to localhost for local dev without the env var.

export const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type FetchOpts = RequestInit & { token?: string | null };

let activeToken: string | null = null;

/**
 * Set the global authentication token for the API client to avoid manual passing.
 */
export function setApiToken(token: string | null) {
  activeToken = token;
}

function withAuth(token?: string | null, opts: RequestInit = {}): RequestInit {
  const t = token !== undefined ? token : activeToken;
  if (!t) return opts;
  return {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      Authorization: `Bearer ${t}`,
    },
  };
}

// ── Request Deduplication Cache ──────────────────────────────────────────────
const pendingRequests = new Map<string, Promise<unknown>>();

export function fetchDeduplicated(key: string, fetcher: () => Promise<unknown>): Promise<unknown> {
  const existing = pendingRequests.get(key);
  if (existing) {
    console.log(`[Deduplicator] Sharing pending request for: ${key}`);
    return existing;
  }
  const promise = fetcher().finally(() => {
    pendingRequests.delete(key);
  });
  pendingRequests.set(key, promise);
  return promise;
}

// ── Exponential Backoff Retry Helper ──────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  retries = 3,
  delay = 1000
): Promise<Response> {
  try {
    const res = await fetch(url, opts);
    if (!res.ok && (res.status >= 500 || res.status === 429) && retries > 0) {
      console.warn(
        `⚠️ [API Retry] Status ${res.status} for ${url}. Retrying in ${delay}ms... (${retries} attempts left)`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, opts, retries - 1, delay * 2);
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      console.warn(
        `⚠️ [API Retry] Network failure for ${url}. Retrying in ${delay}ms... (${retries} attempts left)`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, opts, retries - 1, delay * 2);
    }
    throw err;
  }
}

/**
 * Core fetcher with error handling for 'Failed to Fetch' and logging.
 */
async function fetchAPI(endpoint: string, opts: RequestInit = {}) {
  const url = `${BASE}${endpoint}`;
  try {
    const res = await fetchWithRetry(url, opts);
    if (!res.ok) {
      let detail = `API error: ${res.status} ${res.statusText}`;
      const text = await res.text().catch(() => "");
      if (text) {
        try {
          const errorData = JSON.parse(text);
          detail = errorData.detail ?? text;
        } catch {
          detail = text;
        }
      }
      throw new Error(detail);
    }
    return await res.json();
  } catch (err: unknown) {
    console.error(`❌ [Acumen API Error] URL: ${url}`);
    if (err instanceof Error) {
      console.error(`Message: ${err.message}`);
      if (err.stack) console.error("Stack:", err.stack);
    }
    throw err;
  }
}

export async function fetchNotebooks(token?: string | null) {
  const cacheKey = `/api/notebooks-${token ?? activeToken ?? "anonymous"}`;
  return fetchDeduplicated(cacheKey, () => fetchAPI("/api/notebooks", withAuth(token)));
}

export async function fetchGraphData(sessionId: string, token?: string | null) {
  const cacheKey = `/graph-data/${sessionId}-${token ?? activeToken ?? "anonymous"}`;
  return fetchDeduplicated(cacheKey, () => fetchAPI(`/graph-data/${sessionId}`, withAuth(token)));
}

export type { FetchOpts };
