# Acumen Agent Architecture (LangGraph & ML)

## 1. The Ingestion & Clustering Engine (`ingest.py`)
* **Action:** Receives PDF, extracts text, chunks via `RecursiveCharacterTextSplitter`.
* **ML Integration:** Embeds chunks, then runs `sklearn.cluster.KMeans` (n_clusters=5) to mathematically group the chunks into topical clusters.
* **Output:** A dictionary mapping Cluster IDs to their respective text chunks.

## 2. The Synthesizer Swarm (`wiki_swarm.py`)
* **Action:** A LangGraph state graph that iterates through the ML clusters.
* **Prompt:** "Act as an expert synthesizer. Read these grouped text fragments and write a cohesive, structured Wiki Page (Summary, Key Terms, Insights)."
* **Storage:** Saves these structured Wiki Pages into an in-memory ChromaDB collection (`acumen_wiki`). Metadata must include the generated "Topic Title".

## 3. The Master Action Agent (`action_agent.py`)
* **Action:** A LangGraph Chat Agent that queries the `acumen_wiki` database to answer user prompts.
* **Routing:** The agent has access to 5 strict `@tool` functions. It must decide when to use them based on user intent.

### Tool Definitions:
1.  **`generate_flashcards`**
    * *Trigger:* User asks to study, test knowledge, or make cards.
    * *Action:* Extracts 5 key Q&A pairs from the Wiki.
    * *Output Schema:* JSON list `[{"q": "...", "a": "..."}]` (Rendered as flip-cards on frontend).
2.  **`architecture_assist`**
    * *Trigger:* User asks how to build the system, needs technical specs, or requests architecture.
    * *Action:* Acts as a CTO. Recommends databases, APIs, and scaling paths.
    * *Output Schema:* JSON object `{ "databases": [...], "apis": [...], "scaling": "..." }` (Rendered as Shadcn Cards).
3.  **`extract_action_items`**
    * *Trigger:* User asks for tasks, next steps, or a sprint backlog.
    * *Action:* Extracts actionable to-dos from the document.
    * *Output Schema:* JSON list `[{"task": "...", "status": "todo"}]` (Rendered as an interactive Shadcn checklist).
4.  **`generate_creator_script`**
    * *Trigger:* User wants to make a video, pitch, or content out of the document.
    * *Action:* Acts as a YouTube strategist.
    * *Output Schema:* JSON object `{ "hook": "...", "intro": "...", "core_content": [...], "cta": "..." }` (Rendered in distinct UI sections).
5.  **`live_web_search`**
    * *Trigger:* User asks a question the local ChromaDB cannot answer.
    * *Action:* Executes `DuckDuckGoSearchRun`.
    * *Constraint:* Must explicitly cite that the answer came from the live web. (Triggers a "Web Augmented" badge on the frontend).