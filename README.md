# 💎 Acumen — Executable Knowledge Base

> **"Turn static documents into actionable intelligence."**

Acumen is a production-grade, state-of-the-art "NotebookLM++" platform built for founders, developers, and researchers. It goes far beyond simple summaries; it mathematically clusters page-enriched documents, structures multi-level semantic trees, and deploys a parallel LangGraph synthesis swarm to build an interactive knowledge canvas.

![Acumen Hero](https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1200)

## 🚀 Key Features

*   **🧬 Contextual Ingestion & SQLite-Backed GraphRAG**: Pre-evaluates recursive character segments by prepending 2-3 sentence global summaries (Contextual Retrieval), extracts conceptual entity relations from topic summaries using Gemini structured outputs, and BFS-traverses adjacent nodes in SQLite to inject structural relationships into the RAG pipeline.
*   **🌳 RAPTOR Hierarchical Indexing**: Implements a multi-level RAPTOR index using Gaussian Mixture Model (GMM) clustering and UMAP dimensionality reduction to synthesize abstractive topic summaries.
*   **🌌 WebGL/Three.js 3D Cosmic Force Graph**: Replaces the flat 2D network with a dynamic Three.js physical node-galaxy. Renders topic clusters as glowing, refractive glass spheres using `THREE.MeshPhysicalMaterial`, with auto-rotation drifts, searched scale highlights, wireframe glow halos, and smooth focus-zoom camera transitions.
*   **🎙️ Persistent WebSocket Multimodal Live API**: Feeds raw microphone PCM bytes directly to a `wss://` gateway proxying to `gemini-2.0-flash-exp` co-hosts (`Aoede` & `Puck`) and streams PCM playback chunks back to the browser for real-time live interruption voice loops with sub-300ms latency.
*   **🔥 Two-Stage Hybrid Retrieval & Local Reranking**: Fuses dense embedding scans and sparse BM25 indices via Reciprocal Rank Fusion ($k=60$) alongside topological GraphRAG BFS chunks, and reranks candidates locally using `BAAI/bge-reranker-v2-m3` inside Python for speed and privacy.
*   **🤖 Stateful Swarm Agent & Custom Workspace HUD**: 
    *   **Unified HUD Telemetry**: Floating glassmorphic cards tracking vector capacity, active cluster allocations, and RAG faithfulness scores.
    *   **Fuzzy Command Palette (`ctrl+K`)**: Floating command pill launcher triggering multi-agent actions (`/study`, `/arch`, `/obsidian`, `/podcast`).
    *   **Interactive ML Stepper**: Replaces basic loaders with a real-time scrolling terminal log tracking pipeline thresholds.
    *   **Responsive Layout Presets**: Hot-swaps panel resizes between Galaxy Mode (90% graph focus), split Auditor Mode, and Studio Mode.
    *   **Action Agent Toolbelt**: Integrates the Artifact Studio (briefings, FAQ, timeline ZIP exports), interactive flashcard manager, Obsidian Markdown note-builder, and FastMCP Model Context Protocol API.

---

## 🏛️ Core Documentation

For in-depth explanations of system designs, security controls, and machine learning flows, refer to:
*   **🏛️ [System Architecture & ML Flow](ARCHITECTURE.md)**: K-Means clustering, RAPTOR hierarchies, Hybrid dense+sparse RRF retriever, BGE local Cross-Encoder reranker, and Qdrant abstractions.
*   **🛡️ [Security & Hardening Policy](SECURITY.md)**: Embedded ChromaDB protection against CVE-2026-45829, SSRF blocking shields, prompt injection guards, and rotated JSONL logs.
*   **🤖 [Multi-Agent Swarm Details](AGENTS.md)**: LangGraph multi-node coordination loops and master action agent tool scopes.
*   **🎨 [Aesthetic Design System](DESIGN.md)**: Cosmic gradient backgrounds, glassmorphic visual tokens, and responsive split-pane panel rules.

---

## 🛠️ Tech Stack

*   **Frontend**: Next.js 15 (App Router), React 19, Framer Motion, ReactFlow, React Resizable Panels, Lucide, TailwindCSS 4.0.
*   **Backend**: FastAPI (Python 3.11+), LangChain, LangGraph, ChromaDB (embedded mode), Qdrant Client (in-memory/URL mode), Scikit-Learn, PyPDF.
*   **AI Models**: Gemini 2.5 Flash / Pro (Core Agent Cascades & Fallback Chains), Gemini 3.1 TTS Chirp (`gemini-3.1-flash-tts-preview`), Gemini `models/gemini-embedding-002` (3072-dim embeddings).
*   **Local ML Models**: `BAAI/bge-reranker-v2-m3` (local cross-encoder).
*   **Auth**: Clerk (Enterprise-grade JWT JWKS verification).
*   **Deployment**: Render (FastAPI + SQLite Mount), Vercel (Next.js).

---

## 📦 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+

### Environment Variables (`backend/.env`)
Create a `.env` file in the `backend/` directory:
```bash
GOOGLE_API_KEY=your_gemini_api_key
CLERK_SECRET_KEY=your_clerk_secret_key
ACUMEN_MASTER_KEY=your_base64_encoded_32_byte_master_key # AES Fernet decryption key (optional, auto-generated if omitted)
ENVIRONMENT=production # triggers strict HTTPS and security policies
ACUMEN_DATA_DIR=./data # SQLite database and cache directory path
ACUMEN_VECTOR_DB=chroma # Toggles active vector DB backend ('chroma' or 'qdrant')
QDRANT_URL=:memory: # Used if ACUMEN_VECTOR_DB=qdrant (or cloud endpoint)
ACUMEN_AUTH_BYPASS=false # Set to true to bypass authentication strictly in development
```

### Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/Tejas3479/acumen.git
    cd acumen
    ```

2.  **Backend Setup**
    ```bash
    cd backend
    pip install -r requirements.txt
    uvicorn main:app --reload
    ```

3.  **Frontend Setup**
    ```bash
    cd ../frontend
    npm install
    npm run dev
    ```

---
Built with 💜 by the Acumen Team.
