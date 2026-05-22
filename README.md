# 💎 Acumen — Executable Knowledge Base

> **"Turn static documents into actionable intelligence."**

Acumen is an AI-powered "NotebookLM++" platform built for founders, developers, and researchers. It doesn't just summarize; it synthesizes, clusters, and executes knowledge using an aggressive "CTO-level" agent.

![Acumen Hero](https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1200)

## 🚀 Key Features

- **🧬 ML-Powered Ingestion**: Uses KMeans clustering to mathematically group document chunks into topical "islands" of knowledge.
- **⚡ Parallel Synthesis Swarm**: A LangGraph-orchestrated swarm that synthesizes entire documents concurrently using Gemini 1.5 Flash.
- **🎙️ Podcast Generator**: Transform document insights into a 30-second back-and-forth podcast script with high-fidelity TTS (Hugging Face).
- **🤖 Action Agent Prime**: An "Aggressive CTO" agent with a toolbelt including:
  - **Architecture Assist**: Recommends scalable tech stacks based on your content.
  - **Flashcards**: Instant knowledge testing.
  - **Obsidian Export**: One-click professional Markdown notes.
  - **Viral Thread Creator**: Transform insights for social media.
  - **Live Web Search**: Real-time augmentation via DuckDuckGo.
- **📊 Knowledge Graph**: Interactive ReactFlow visualization of conceptual relationships.

## 📖 Core Documentation

For in-depth explanations of system design, machine learning pipelines, and security controls, refer to:
- **🏛️ [System Architecture & ML Flow](ARCHITECTURE.md)**: K-Means clustering, unit $L_2$ normalization, LangGraph Synthesizer Swarms, and 2-stage RAG reranking maps.
- **🛡️ [Security & Hardening Policy](SECURITY.md)**: OWASP Top 10 mitigations, dynamic AES Fernet key encryption at rest, loopback SSRF blocklists, and prompt injection filters.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Framer Motion, ReactFlow, Lucide, TailwindCSS 4.0.
- **Backend**: FastAPI (Python 3.11), LangChain, LangGraph, ChromaDB, Scikit-Learn.
- **AI Models**: Gemini 2.5 Flash (Core Agent, Swarm & Cross-Encoder Reranker), Gemini `gemini-embedding-001` (Embeddings), Hugging Face TTS (Audio).
- **Auth**: Clerk (Enterprise-grade JWT verification).
- **Security (OWASP Top 10 Hardened)**:
  - **A02:2021**: API Key Encryption at Rest (via symmetric `cryptography.fernet`).
  - **LLM01 / Injection Defense**: High-accuracy prompt injection shield & input sanitization.
  - **SSRF Shield**: RFC-1918 private IP range checks blocking local network traversal for URL ingestion.
  - **HTTPS Redirection**: Automated middleware enforcing secure SSL redirection in production.
  - **Audit Logging**: JSONL rotating event logger for all security-critical operations.
  - **Strict CSP**: Production Content Security Policy and security headers in frontend configuration.
- **Deployment**: Render (Backend + Persistent Disk Mount), Vercel (Frontend).

## 🧑‍💻 Aggressive CTO Persona

Acumen is designed with a specific personality. It’s concise, brilliant, and slightly sarcastic. It addresses you as **"Founder"** or **"Partner"** and focuses strictly on high-impact insights and scalable architecture. No fluff. Just execution.

## 📦 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+

### Environment Variables (`backend/.env`)
Create a `.env` file in the `backend/` directory:
```bash
GOOGLE_API_KEY=your_gemini_api_key
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_JWT_KEY=your_clerk_pem_public_key
ENCRYPTION_KEY=32_byte_symmetric_key_or_auto_generated
ENVIRONMENT=production # triggers strict HTTPS and security policies
ACUMEN_DATA_DIR=./data # SQLite database directory path
```

### Environment Variables (`frontend/.env.local`)
Create a `.env.local` file in the `frontend/` directory:
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Installation

1. **Clone the repo**
   ```bash
   git clone https://github.com/Tejas3479/acumen.git
   cd acumen
   ```

2. **Backend Setup**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 🏆 Hackathon Judges Note
Acumen solves the "Information Overload" problem by providing a structured, interactive, and executable interface for knowledge. The 2-stage RAG (Vector Search + Gemini 2.5 Flash Cross-Encoder Reranking) ensures that the Action Agent is significantly more accurate than standard chatbot implementations, while remaining incredibly fast and optimized for free-tier deployments.

---
Built with 💜 by the Acumen Team.

