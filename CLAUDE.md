# Acumen Production Developer Guide (CLAUDE.md)

This document provides building blocks, command lines, structural constraints, and quality greenlight parameters for maintaining the **Acumen (v3.2)** workspace.

---

## 🛠️ Build & Run Commands

### Backend (FastAPI + Python 3.11+)
- **Activate Virtual Environment**:
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- **Install Dependencies**:
  ```bash
  pip install -r requirements.txt
  ```
- **Run Live Server**:
  ```bash
  uvicorn main:app --reload --port 8000
  ```
- **Syntax & Compilation Validation**:
  ```bash
  python -m py_compile main.py engine/vector_store.py
  ```

### Frontend (Next.js 15 + React 19)
- **Install Dependencies**:
  ```bash
  npm install
  ```
- **Run Dev Server**:
  ```bash
  npm run dev
  ```
- **TypeScript Type Safety Verification**:
  ```bash
  npx tsc --noEmit
  ```
- **Production Build compilation**:
  ```bash
  npm run build
  ```

---

## 🛡️ Key System Architecture Constraints

1.  **Vector Store Abstraction (`VectorStoreInterface`)**:
    - All vector insertions and queries must strictly route through the abstract `get_vector_store()` singleton.
    - Support ChromaDB Persistent Embedded mode and Qdrant database backend hot-switching (`ACUMEN_VECTOR_DB`).
    - Qdrant local-mode memory requires positional initialization `QdrantClient(":memory:")`.
    - All Qdrant point IDs must be deterministically hashed into RFC-4122 UUID strings using `uuid.uuid5(uuid.NAMESPACE_DNS, raw_id)`.
2.  **Two-Stage GraphRAG & Local Reranking**:
    - Fuses dense Cosine similarities and sparse BM25 keywords via Reciprocal Rank Fusion (RRF $k=60$).
    - Performs pairwise entity relationship extraction from topic Summaries, saves them to SQLite relational adjacency tables, and BFS-traverses adjacent nodes up to depth 2 to inject topological structural context.
    - Reranks the merged local and topological GraphRAG candidates using the local `BAAI/bge-reranker-v2-m3` model inside the Python process loop to prevent external roundtrip network lag.
3.  **Persistent WebSocket Multimodal Live API**:
    - Bidirectional raw microphone voice inputs are downsampled to 16kHz mono PCM, securely proxy-piped via FastAPI WebSockets using Clerk JWT authentication tokens in query parameters (`?token=xxx`).
    - Stream responses down to the browser from `gemini-2.0-flash-exp` co-hosts (`Aoede` & `Puck`) and queue PCM chunks in a Web Audio API timeline for sub-300ms real-time interruption lag.
4.  **Immersive WebGL 3D Force-Directed Graph**:
    - Physical orbital node point clouds render topic nodes as translucent glass spheres using `THREE.MeshPhysicalMaterial`.
    - Searched nodes scale up and mount wireframe glow halos. Directional edge lines pulse along relationship paths.
    - Hovering or clicking a citation badge dispatches custom window-level DOM events triggering camera focus-zoom pivots and sliding open the `WikiSheet` drawer.
5.  **Security Boundaries (OWASP Hardened)**:
    - **API Keys**: Dynamic third-party integration keys must be encrypted/decrypted at rest via `key_manager.py` AES symmetric Fernet encryption.
    - **SSRF Prevener**: Prohibit private RFC-1918 loopback and Link-Local IP requests in `/upload-url` domain parsing.
    - **Prompt Injection**: Process inputs through the input regex sanitizer in `sanitizer.py`.
    - **Audit Trails**: rotated JSONL log files tracking security-critical events under `logs/audit.jsonl`.
6.  **Aesthetics & Visual Excellence**:
    - All dashboard views must reflect glassmorphic translucent panels (`rgba(...)` and `backdrop-filter: blur(24px)`) floating over the cosmic gradient mesh backdrop and dot grid masks.
    - Integrate floating stats telemetry cards, keyboard command palettes (`ctrl+K`), interactive ML logging steppers, and layout presets (Galaxy, Auditor, Studio).