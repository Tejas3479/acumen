# Acumen Multi-Agent Swarm Architecture (LangGraph & Fallbacks)

Acumen leverages a stateful, hierarchical multi-agent swarm built on **LangGraph**. By structuring agents as compiled graphs with persistent checkpointers, the system maintains conversational memory, recovers from model rate limits, and executes complex tool workflows securely.

---

## 🗺️ Master Agent Graph Topology

```
                         [User Query / Slash Command]
                                     │
                                     ▼
                     [Workspace Command Palette HUD]
                                     │
                                     ▼
            [Swarm Director Node] <─── [SqliteSaver Checkpoint Memory]
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   [GraphRAG Retrieval]     [Direct Swarm Tools]
   ├─> Dense/Sparse RRF     ├─> Obsidian Note Generator
   └─> SQLite BFS Walk      ├─> Flashcards & Kanban Board
          │                 ├─> CTO Architecture Specs
          ▼                 ├─> Briefing Artifact compilation
   [BGE Reranker Filter]    └─> Live Web Search Augmenter
          │
          ▼
   [Response Synthesizer] ───> [OTel Telemetry Stats Dashboard]
          │
          ▼
   [Live WebSocket Voice Loop / PCM audio output]
```

---

## 🧬 1. LangGraph State & Checkpoint Saver (`action_agent.py`)

*   **Stateful Graph**: Coordinated via a structured `SwarmAgentState` TypedDict containing user messages, rewritten search queries, chat histories, agent metadata lists, and sub-agent outputs.
*   **Checkpoint Persistence (`SqliteSaver`)**: All node transitions and conversational steps are preserved inside our persistent SQLite database (`data/acumen.db`). This enables multi-turn memory checkpoints, session recovery, and mid-dialogue restarts.
*   **Model Fallback Chain Resilience**: To guarantee zero-downtime, all swarm LLM calls are routed through a dynamic fallback handler:
    ```
    gemini-2.5-flash ──(Failure/Quota)──> gemini-2.5-flash-lite ──(Failure)──> gemini-2.5-pro
    ```

---

## 🎙️ 2. Topological Ingestion Swarm Graph (`ingest_v2.py` & `wiki_swarm.py`)

When a new workspace source is uploaded or synthesized, the platform launches an async, non-blocking **Topological Ingestion Swarm**:

1.  **Partitioning**: Segregates leaf vectors into 5 semantic topic directories using Scikit-Learn KMeans models.
2.  **Parallel Synthesizers**: Launches async worker threads across all clusters in parallel using LangGraph.
3.  **Wiki Synthesizer Prompt**:
    > "Act as a semantic synthesizer. Examine these grouped leaf chunks, isolate common conceptual patterns, and compile a structured Wiki Page JSON output containing the Topic Title, global Summary, Key Terms, and structural Insights."
4.  **GraphRAG Adjacency Edge Node**: A dedicated relationship analyzer isolates Level 1 topic islands and fires parallel entity relationship extractions via Gemini. It saves extracted nodes and directional relationships (e.g. *implements interface*, *extends data model*) directly into SQLite relational tables (`graph_nodes`, `graph_edges`), building the conceptual topology database.

---

## 🛠️ 3. Master Action Agent Toolbelt Nodes & HUD Commands

The Master Agent has access to five premium, high-retention executable tools, hot-swappable via the keyboard Command Palette (`ctrl+K`):

### 1. `/study` ➔ `generate_flashcards`
*   **Trigger**: User inputs a study command or selects the study intent in the Command Palette.
*   **Action**: Extracts high-retention Term/Definition Q&A pairs from the synthesized Wiki.
*   **Output**: Renders premium glassmorphic flippable cards in the side panel, persisting got-it/study states (`known` vs `review`) dynamically in SQLite.

### 2. `/arch` ➔ `cto_architecture_assist`
*   **Trigger**: User inputs architecture queries or triggers it from the Command Palette.
*   **Action**: Generates complete system specifications (Databases, API specs, Caching strategies, Scaling pipelines) with structural rationale.
*   **Output**: Styled HTML/Markdown cards detailing target configurations.

### 3. `/tasks` ➔ `extract_action_items`
*   **Trigger**: User asks for action lists, next steps, checklist tasks, or sprint backlogs.
*   **Action**: Compiles to-do items from the text.
*   **Output**: Interactive, checkable checklists that persist status dynamically in SQLite.

### 4. `/obsidian` ➔ `generate_briefing_artifact`
*   **Trigger**: User interacts with the Artifact Studio to request Research briefings, FAQs, Timelines, or Study Guides.
*   **Action**: Dispatches structured Gemini JSON templates to synthesize premium summaries, exportable as unified Research Pack ZIPs.

### 5. `live_web_search`
*   **Trigger**: User asks questions exceeding local document bounds or requiring fresh context.
*   **Action**: Launches `DuckDuckGoSearchRun`.
*   **Output**: Returns web-augmented answers, appending verified search favicon links and citation indicators to the UI.