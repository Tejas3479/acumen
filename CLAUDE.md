# Acumen: The Executable Wiki (Hackathon Project)

## Project Overview
We are building a 24-hour hackathon project that aggressively upgrades the "NotebookLM" concept. Standard RAG retrieves fragmented chunks. Acumen uses the "Karpathy Wiki Pattern" combined with unsupervised Machine Learning (KMeans) to synthesize cohesive documents. It also features an "Action Agent" that executes tasks on the data, moving from read-only to an executable workspace.

## Tech Stack
* **Frontend:** Next.js (App Router), Tailwind CSS, Shadcn/UI, Radix, React Flow (with dagre for auto-layout), Clerk Auth.
* **Backend:** FastAPI, Python 3.11+, LangGraph, Scikit-Learn (KMeans), ChromaDB (in-memory), cryptography.
* **LLM Integration:** LangChain, Google Gemini 2.5 Flash, Gemini `gemini-embedding-001` Embeddings, DuckDuckGo Web Search.

## Architecture Guidelines & Constraints (CRITICAL)
1.  **Speed Over Perfection:** This is a 24-hour hackathon. Write clean, modular, but highly pragmatic code. Do not implement complex OAuth, heavy enterprise databases (like Neo4j or Postgres), or WebSocket streaming.
2.  **No Hallucinations:** Always strictly type Python functions. Use Pydantic models for FastAPI routes and JSON tool outputs.
3.  **Aesthetics Matter:** The frontend must look production-ready. Default to dark mode. Use Shadcn components heavily. JSON tool outputs from the backend MUST be intercepted and rendered as beautiful UI components (Glassmorphic cards, checklists, etc.), never raw text.
4.  **OWASP Security Hardening**:
    - **API Keys**: All dynamic third-party integration keys must be encrypted/decrypted at rest via `key_manager.py`.
    - **Prompt Injection Shield**: Validate all incoming chat text in `/chat` using regex sanitization patterns.
    - **SSRF Prevention**: Prohibit private IP host requests in `/upload-url` to shield backend services.
    - **Audit Log Trail**: Keep rotate logs of all upload, synthesis, chat, and blocking events.
    - **Next.js Vercel Tracing**: Anchor `outputFileTracingRoot` conditionally (`process.env.VERCEL ? undefined : path.join(__dirname, "../")`) to ensure zero-config Vercel standalone compiling.
5.  **Error Handling:** Assume the LLM might timeout. Add loading states (skeletons/spinners) and Shadcn toast notifications for all async operations.


## Directory Structure
/backend
  /engine (ingest.py, wiki_swarm.py, action_agent.py)
  main.py
/frontend
  /app (page.tsx, layout.tsx, globals.css)
  /components (ui widgets, react-flow graph)