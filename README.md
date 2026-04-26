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

## 🛠️ Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Framer Motion, ReactFlow, Lucide, TailwindCSS 4.0.
- **Backend**: FastAPI (Python 3.11), LangChain, LangGraph, ChromaDB, Scikit-Learn.
- **AI Models**: Gemini 1.5 Flash (Synthesizer & Agent), Hugging Face TTS (Audio).
- **Auth**: Clerk (Enterprise-grade JWT verification).
- **Deployment**: Render (Backend + Persistence), Vercel (Frontend).

## 🧑‍💻 Aggressive CTO Persona

Acumen is designed with a specific personality. It’s concise, brilliant, and slightly sarcastic. It addresses you as **"Founder"** or **"Partner"** and focuses strictly on high-impact insights and scalable architecture. No fluff. Just execution.

## 📦 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+
- Google Gemini API Key
- Clerk Secret Keys

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
Acumen solves the "Information Overload" problem by providing a structured, interactive, and executable interface for knowledge. The 2-stage RAG (Vector Search + LLM Reranking) ensures that the Action Agent is significantly more accurate than standard chatbot implementations.

---
Built with 💜 by the Acumen Team.
