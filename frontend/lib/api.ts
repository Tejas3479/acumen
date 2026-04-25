// Acumen — API client (all backend calls in one place)
// BASE is set via NEXT_PUBLIC_BACKEND_URL in .env.local
// Falls back to localhost for local dev without the env var.

export const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type FetchOpts = RequestInit & { token?: string | null };

function withAuth(token: string | null | undefined, opts: RequestInit = {}): RequestInit {
  if (!token) return opts;
  return {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Core fetcher with error handling for 'Failed to Fetch' and logging.
 */
async function fetchAPI(endpoint: string, opts: RequestInit = {}) {
  const url = `${BASE}${endpoint}`;
  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      let detail = `API error: ${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        detail = errorData.detail ?? detail;
      } catch (e) {
        // Fallback if not JSON
        const text = await res.text().catch(() => "");
        if (text) detail = text;
      }
      throw new Error(detail);
    }
    return await res.json();
  } catch (err: any) {
    // This catches both 'Failed to Fetch' (network error) and the thrown API errors
    console.error(`❌ [Acumen API Error] URL: ${url}`);
    console.error(`Message: ${err.message}`);
    if (err.stack) console.error("Stack:", err.stack);
    throw err;
  }
}

export async function fetchNotebooks(token?: string | null) {
  return fetchAPI("/api/notebooks", withAuth(token));
}

export async function uploadPDF(file: File, token?: string | null) {
  const form = new FormData();
  form.append("file", file);
  return fetchAPI("/upload", withAuth(token, { method: "POST", body: form }));
}

export async function synthesize(sessionId: string, token?: string | null) {
  return fetchAPI(`/synthesize/${sessionId}`, withAuth(token, { method: "POST" }));
}

export async function pollStatus(sessionId: string, token?: string | null) {
  return fetchAPI(`/status/${sessionId}`, withAuth(token));
}

export async function fetchGraphData(sessionId: string, token?: string | null) {
  return fetchAPI(`/graph-data/${sessionId}`, withAuth(token));
}

export async function sendChat(
  sessionId: string,
  message: string,
  history: { role: string; content: string }[],
  token?: string | null
) {
  return fetchAPI("/chat", withAuth(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message, history }),
  }));
}

export type { FetchOpts };
