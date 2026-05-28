"""
Acumen — Advanced Ingestion & RAPTOR Indexing Engine v2
======================================================
This module implements the 2026 state-of-the-art ingestion pipeline:
1. Native PDF parsing via Gemini Files API (with pypdf fallback).
2. Contextual Retrieval: Prepends global document summary context to every chunk.
3. Page-level recursive character text chunking to preserve citation boundaries.
4. Rich chunk metadata: page_num, section_title, char_offset, source_id, raptor_level.
5. RAPTOR Hierarchical indexing via Gaussian Mixture Models & UMAP.
"""

from __future__ import annotations

import io
import os
import json
import uuid
import logging
import asyncio
from typing import Dict, List, Any, Optional

import numpy as np
import pypdf
import chromadb
from chromadb.api.types import Documents, Embeddings, EmbeddingFunction
from bs4 import BeautifulSoup
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.messages import SystemMessage, HumanMessage

from engine.embedder import get_document_embedder
from engine.raptor import build_raptor_tree
from engine.graph_store import save_graph_elements, clear_session_graph

logger = logging.getLogger(__name__)

ENTITY_EXTRACTION_PROMPT = """You are a knowledge graph engineer. Analyze the following document text and extract:
1. Significant named entities (concepts, technologies, organizations, people, definitions, equations).
2. Direct relational connections between these entities.

For each entity, extract:
- id: A clean, lowercase alphanumeric string (e.g. "fastapi")
- label: A concise readable name (e.g. "FastAPI")
- entity_type: One of [concept, technology, organization, person, definition, other]
- summary: A brief 1-2 sentence description explaining what it is based on the context.

For each relationship, extract:
- source: The id of the source entity
- target: The id of the target entity
- relationship: A short lowercase action verb representing the relation (e.g. "implements", "uses", "developed_by", "extends")

Respond strictly with ONLY a valid JSON object matching this schema, with no markdown fences:
{
  "nodes": [{"id": "...", "label": "...", "entity_type": "...", "summary": "..."}],
  "edges": [{"source": "...", "target": "...", "relationship": "..."}]
}
"""

async def extract_and_save_graph(session_id: str, l1_nodes: List[Dict[str, Any]]):
    """Parallel entity extraction from RAPTOR Level 1 summaries using Gemini."""
    from engine.fallback_chain import invoke_llm_with_fallback
    
    tasks = []
    
    async def extract_single(node_text: str):
        prompt = f"Document content:\n{node_text}\n\nExtract nodes and edges:"
        try:
            resp = await invoke_llm_with_fallback(
                [SystemMessage(content=ENTITY_EXTRACTION_PROMPT), HumanMessage(content=prompt)],
                temperature=0.1,
                max_tokens=1500,
                structured_json=True
            )
            raw = str(resp.content).strip()
            # Clean markdown JSON fences
            if raw.startswith("```"):
                lines = raw.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw = "\n".join(lines).strip()
            return json.loads(raw)
        except Exception as e:
            logger.error("Failed to extract graph from node: %s", e)
            return {"nodes": [], "edges": []}
            
    for n in l1_nodes:
        if n.get("raptor_level") == 1:
            tasks.append(extract_single(n["text"]))
            
    if not tasks:
        logger.warning("No Level 1 nodes found to build graph.")
        return
        
    logger.info("Extracting GraphRAG elements from %d topic clusters...", len(tasks))
    results = await asyncio.gather(*tasks)
    
    all_nodes = []
    all_edges = []
    seen_nodes = set()
    seen_edges = set()
    
    for res in results:
        for n in res.get("nodes", []):
            nid = n.get("id", "").strip().lower()
            if nid and nid not in seen_nodes:
                seen_nodes.add(nid)
                all_nodes.append({
                    "id": nid,
                    "label": n.get("label", nid),
                    "entity_type": n.get("entity_type", "concept"),
                    "summary": n.get("summary", "")
                })
        for e in res.get("edges", []):
            src = e.get("source", "").strip().lower()
            tgt = e.get("target", "").strip().lower()
            rel = e.get("relationship", "").strip().lower()
            if src and tgt and rel:
                edge_key = (src, tgt, rel)
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)
                    all_edges.append({
                        "source": src,
                        "target": tgt,
                        "relationship": rel
                    })
                    
    save_graph_elements(session_id, all_nodes, all_edges)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150
CHROMA_PERSIST_PATH = os.environ.get("ACUMEN_CHROMA_PATH", "./chroma_db")
CHROMA_CHUNKS_COLLECTION = "acumen_chunks"

_chroma_client: Optional[chromadb.PersistentClient] = None
_chunks_collection: Optional[chromadb.Collection] = None


class GeminiEmbeddingFunction(EmbeddingFunction):
    """Wrapper to make LangChain embeddings compatible with ChromaDB."""
    def __init__(self, model_name: str = "models/gemini-embedding-002"):
        api_key = os.getenv("GOOGLE_API_KEY")
        self.embedder = GoogleGenerativeAIEmbeddings(model=model_name, google_api_key=api_key)
    def __call__(self, input: Documents) -> Embeddings:
        return self.embedder.embed_documents(list(input))
    def name(self) -> str:
        return "GeminiEmbeddingFunction"


def get_chunks_collection() -> chromadb.Collection:
    """Return the persistent `acumen_chunks` ChromaDB collection."""
    from engine.vector_store import get_vector_store
    store = get_vector_store()
    if hasattr(store, "_get_collection"):
        return store._get_collection(CHROMA_CHUNKS_COLLECTION)
        
    global _chroma_client, _chunks_collection
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_PATH)
        logger.info("ChromaDB PersistentClient for chunks initialised.")
    
    if _chunks_collection is None:
        try:
            embedding_fn = GeminiEmbeddingFunction(model_name="models/gemini-embedding-002")
        except Exception as e:
            logger.error("Failed to initialize Gemini embedding-002: %s", e)
            raise RuntimeError(f"Failed to initialize Gemini embedding-002 function: {e}") from e
        
        _chunks_collection = _chroma_client.get_or_create_collection(
            name=CHROMA_CHUNKS_COLLECTION,
            metadata={"hnsw:space": "cosine"},
            embedding_function=embedding_fn,
        )
        logger.info("ChromaDB collection '%s' ready.", CHROMA_CHUNKS_COLLECTION)
    
    return _chunks_collection


# ---------------------------------------------------------------------------
# Native PDF Extraction via Gemini Files API
# ---------------------------------------------------------------------------

async def extract_text_native_api(file_path: str) -> List[Dict[str, Any]]:
    """
    Ingests a document using Gemini Files API.
    Extracts structural page-by-page JSON.
    """
    import google.generativeai as genai
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set.")
    genai.configure(api_key=api_key)

    logger.info("Uploading file to Gemini Files API: %s", file_path)
    uploaded_file = genai.upload_file(file_path)
    
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = """
        Analyze this document page-by-page and extract the text.
        For each page, output an item in a JSON array:
        [
          {
            "page": N,
            "text": "plain text of page N, preserving tables as markdown tables",
            "section_title": "heading or section title on this page, or null if none"
          },
          ...
        ]
        Return ONLY valid JSON.
        """
        response = await model.generate_content_async(
            [uploaded_file, prompt],
            generation_config={"response_mime_type": "application/json"}
        )
        
        data = json.loads(response.text.strip())
        logger.info("Successfully extracted text page-by-page using Files API.")
        return data
    except Exception as e:
        logger.error("Gemini Files API text extraction failed: %s. Falling back to local pypdf.", e)
        raise e
    finally:
        # Clean up the file from Gemini cloud storage
        try:
            uploaded_file.delete()
            logger.info("Successfully deleted temporary Files API file.")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Fallback parsers
# ---------------------------------------------------------------------------

def fallback_extract_pdf_pages(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Fallback local PDF page extractor using pypdf."""
    reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            pages.append({
                "page": i + 1,
                "text": text,
                "section_title": None
            })
    return pages


# ---------------------------------------------------------------------------
# Contextual Retrieval Helper
# ---------------------------------------------------------------------------

async def generate_global_summary(raw_text: str) -> str:
    """Generate a brief 2-3 sentence global summary of the document for Contextual Retrieval."""
    from engine.fallback_chain import invoke_llm_with_fallback
    
    prompt = f"""Summarize this document in 2-3 sentences. Focus strictly on the core theme, target subject, and general purpose.
    Document text sample:
    {raw_text[:8000]}
    
    Summary:"""
    
    try:
        resp = await invoke_llm_with_fallback(
            [HumanMessage(content=prompt)],
            temperature=0.2,
            max_tokens=150
        )
        return str(resp.content).strip()
    except Exception as e:
        logger.warning("Failed to generate global summary: %s", e)
        return "A technical reference document."


# ---------------------------------------------------------------------------
# Core Ingestion Pipeline v2
# ---------------------------------------------------------------------------

async def ingest_document_v2(
    file_bytes: bytes, 
    filename: str, 
    session_id: str, 
    source_id: Optional[str] = None
) -> Dict[int, List[str]]:
    """
    Ingests any document type (PDF, DOCX, TXT, HTML):
    1. Parses structural text with page numbers.
    2. Generates a global summary (Contextual Retrieval).
    3. Chunks page-by-page and enriches with metadata.
    4. Prepends contextual block to every chunk text.
    5. Builds and inserts a 3-level RAPTOR tree into ChromaDB `acumen_chunks`.
    6. Groups leaf chunks into KMeans clusters for Swarm backward-compatibility.
    """
    logger.info("=== Ingestion Pipeline v2 START: '%s' ===", filename)
    
    if not source_id:
        source_id = f"src_{uuid.uuid4().hex[:8]}"

    ext = filename.lower().split(".")[-1]
    pages: List[Dict[str, Any]] = []

    # 1. Structural Parse
    if ext == "pdf":
        # Save temp file for Files API
        temp_dir = os.path.join(os.environ.get("ACUMEN_DATA_DIR", "./data"), "temp")
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, f"{source_id}.pdf")
        
        try:
            with open(temp_path, "wb") as f:
                f.write(file_bytes)
            pages = await extract_text_native_api(temp_path)
        except Exception:
            logger.info("Running local PDF fallback parsing...")
            pages = fallback_extract_pdf_pages(file_bytes)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    elif ext == "docx":
        from engine.ingest import extract_text_from_docx
        raw_text = extract_text_from_docx(file_bytes)
        pages = [{"page": 1, "text": raw_text, "section_title": None}]
    elif ext in ("html", "htm"):
        from engine.ingest import extract_text_from_html
        raw_text = extract_text_from_html(file_bytes)
        pages = [{"page": 1, "text": raw_text, "section_title": None}]
    elif ext in ("txt", "md", "markdown"):
        from engine.ingest import extract_text_from_txt
        raw_text = extract_text_from_txt(file_bytes)
        pages = [{"page": 1, "text": raw_text, "section_title": None}]
    else:
        raise ValueError(f"Unsupported file format: {ext}")

    if not pages:
        raise ValueError("Could not extract any content pages from the document.")

    # 2. Contextual Retrieval Summary Generation
    full_doc_text = "\n\n".join(p["text"] for p in pages)
    logger.info("Extracted %d pages, %d chars.", len(pages), len(full_doc_text))
    
    global_summary = await generate_global_summary(full_doc_text)
    logger.info("Global summary generated: %s", global_summary)

    # 3. Recursive Character Chunking Page-by-Page
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    leaf_chunks_metadata = []
    chunk_index = 0

    for page_data in pages:
        page_num = page_data["page"]
        text = page_data["text"]
        section = page_data.get("section_title") or ""
        
        page_chunks = splitter.split_text(text)
        
        for c_text in page_chunks:
            # Calculate char offset within the page
            char_offset = text.find(c_text)
            if char_offset == -1:
                char_offset = 0
                
            # Prepend Contextual Retrieval summary
            contextual_header = f"This document chunk is from '{filename}' which discusses: {global_summary}\n\nContext:\n"
            enriched_text = contextual_header + c_text
            
            leaf_chunks_metadata.append({
                "text": enriched_text,
                "raw_text_only": c_text, # Saved for clean citation viewing
                "session_id": session_id,
                "source_id": source_id,
                "source_title": filename,
                "page_num": page_num,
                "section_title": section,
                "char_offset": char_offset,
                "chunk_index": chunk_index,
                "raptor_level": 0,
                "cluster_id": -1
            })
            chunk_index += 1

    # 4. Build RAPTOR Index (Layer 1 + Layer 2 tree summaries)
    logger.info("Raw leaf chunks generated: %d. Starting RAPTOR indexing...", len(leaf_chunks_metadata))
    tree_nodes = await build_raptor_tree(leaf_chunks_metadata, session_id)
    
    # 4.5. Run GraphRAG Entity Extraction (Upgrade B)
    try:
        clear_session_graph(session_id)
        # We spawn the graph extractor on the synthesized GMM topic clusters (Layer 1 tree nodes)
        await extract_and_save_graph(session_id, tree_nodes)
    except Exception as graph_err:
        logger.error("Failed to build GraphRAG entity relationship index: %s", graph_err)

    all_nodes = leaf_chunks_metadata + tree_nodes
    logger.info("RAPTOR completed. Total indexed tree nodes: %d", len(all_nodes))

    # 5. Insert all tree nodes into ChromaDB `acumen_chunks` using abstract interface
    from engine.vector_store import get_vector_store
    vector_store = get_vector_store()
    
    ids = []
    documents = []
    metadatas = []
    
    for idx, node in enumerate(all_nodes):
        doc_id = f"{session_id}_{node['source_id']}_node_{node['raptor_level']}_{idx}"
        ids.append(doc_id)
        documents.append(node["text"])
        metadatas.append({
            "session_id": node["session_id"],
            "source_id": node["source_id"],
            "source_title": node["source_title"],
            "page_num": node["page_num"],
            "section_title": node["section_title"] or "",
            "char_offset": node["char_offset"],
            "chunk_index": node["chunk_index"],
            "raptor_level": node["raptor_level"],
            "cluster_id": node["cluster_id"],
            "raw_text_only": node.get("raw_text_only", node["text"])
        })
        
    vector_store.upsert(collection_name="acumen_chunks", ids=ids, documents=documents, metadatas=metadatas)
    logger.info("Successfully upserted all RAPTOR tree nodes to ChromaDB via VectorStoreInterface.")

    # 6. Backward Compatibility: Group leaf chunks into KMeans clusters for WikiSwarm
    # We fit a quick local KMeans clustering to comply with existing wiki pages pipeline.
    # This ensures the ReactFlow graph works seamlessly without rewriting the entire frontend node system.
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import normalize
    
    n_kmeans_clusters = 5
    leaf_texts = [n["raw_text_only"] for n in leaf_chunks_metadata]
    
    if len(leaf_texts) < n_kmeans_clusters:
        legacy_clusters = {0: leaf_texts}
    else:
        embedder = get_document_embedder()
        leaf_embeddings = await embedder.aembed_documents(leaf_texts)
        leaf_embeddings_norm = normalize(np.array(leaf_embeddings, dtype=np.float32), norm="l2")
        
        kmeans = KMeans(n_clusters=n_kmeans_clusters, random_state=42, n_init="auto")
        labels = kmeans.fit_predict(leaf_embeddings_norm)
        
        legacy_clusters = {i: [] for i in range(n_kmeans_clusters)}
        for chunk, label in zip(leaf_texts, labels.tolist()):
            legacy_clusters[int(label)].append(chunk)

    logger.info("=== Ingestion Pipeline v2 COMPLETE ===")
    return legacy_clusters


def metas_cast_safe(metadatas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Helper to ensure metadata values are simple types compatible with ChromaDB."""
    safe = []
    for m in metadatas:
        safe_meta = {}
        for k, v in m.items():
            if v is None:
                safe_meta[k] = ""
            elif isinstance(v, (str, int, float, bool)):
                safe_meta[k] = v
            else:
                safe_meta[k] = str(v)
        safe.append(safe_meta)
    return safe


async def ingest_url_v2(url: str, session_id: str, source_id: Optional[str] = None) -> Dict[int, List[str]]:
    """Ingests text scraped from a URL using advanced pipeline v2."""
    logger.info("=== Ingestion Pipeline URL v2 START: '%s' ===", url)
    from engine.ingest import scrape_website_text
    
    # Run scraping in a thread to avoid blocking
    loop = asyncio.get_running_loop()
    raw_text = await loop.run_in_executor(None, scrape_website_text, url)
    
    # Create a nice fallback title
    title = url.split("//")[-1].split("/")[0]
    
    # Represent website as a single page
    file_bytes = raw_text.encode("utf-8")
    return await ingest_document_v2(file_bytes, title, session_id, source_id)
