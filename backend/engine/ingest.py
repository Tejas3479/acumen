"""
Acumen — Ingestion & ML Clustering Engine
==========================================
Karpathy Wiki Pattern: Step 1
  1. Extract text from an uploaded PDF.
  2. Chunk text with RecursiveCharacterTextSplitter.
  3. Embed every chunk (Gemini gemini-embedding-001).
  4. Cluster embeddings with KMeans (n_clusters=5).
  5. Return { cluster_id (int): [chunk_texts] } for the Synthesizer Swarm.
"""

from __future__ import annotations

import io
import logging
from typing import Dict, List

import numpy as np
import requests
from bs4 import BeautifulSoup
from sklearn.cluster import KMeans
from sklearn.preprocessing import normalize

import pypdf
from langchain_text_splitters import RecursiveCharacterTextSplitter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
CHUNK_SIZE: int = 1000
CHUNK_OVERLAP: int = 150
N_CLUSTERS: int = 5
RANDOM_STATE: int = 42


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------

def _get_embedder():
    """
    Return a callable: list[str] → np.ndarray (shape: n × dim).

    Uses Gemini gemini-embedding-001 model for embeddings.
    """
    import os

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set in environment variables.")

    try:
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        gai = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

        def _embed_gemini(texts: List[str]) -> np.ndarray:
            vecs = gai.embed_documents(texts)
            return np.array(vecs, dtype=np.float32)

        logger.info("Embedder: Gemini gemini-embedding-001")
        return _embed_gemini
    except Exception as exc:
        logger.error("Gemini embedder initialization failed: %s", exc)
        raise RuntimeError(f"Failed to initialize Gemini embeddings: {exc}") from exc


# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Parse raw PDF bytes and return concatenated plain text."""
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    pages: List[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    if not pages:
        raise ValueError("PDF appears to be empty or contains only images (no extractable text).")
    return "\n".join(pages)


def chunk_text(raw_text: str) -> List[str]:
    """
    Split raw text into overlapping chunks using LangChain's
    RecursiveCharacterTextSplitter.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(raw_text)
    logger.info("Text split into %d chunks.", len(chunks))
    return chunks


def cluster_chunks(chunks: List[str]) -> Dict[int, List[str]]:
    """
    Core ML step:
      • Embed all chunks.
      • L2-normalise embeddings (improves cosine-distance KMeans).
      • Fit KMeans with n_clusters=5.
      • Group chunk texts by assigned cluster label.

    Returns:
        { cluster_id: [chunk_text, ...] }
    """
    if len(chunks) < N_CLUSTERS:
        # Edge case: too few chunks — put everything in cluster 0
        logger.warning(
            "Only %d chunks found (< %d clusters). Assigning all to cluster 0.",
            len(chunks),
            N_CLUSTERS,
        )
        return {0: chunks}

    # 1. Embed
    embedder = _get_embedder()
    embeddings: np.ndarray = embedder(chunks)          # shape: (n_chunks, dim)

    # 2. L2-normalise so KMeans behaves like cosine similarity
    embeddings_norm = normalize(embeddings, norm="l2")

    # 3. KMeans clustering
    kmeans = KMeans(
        n_clusters=N_CLUSTERS,
        random_state=RANDOM_STATE,
        n_init="auto",          # suppresses FutureWarning in sklearn ≥ 1.4
        max_iter=300,
    )
    labels: np.ndarray = kmeans.fit_predict(embeddings_norm)

    # 4. Group chunks by cluster label
    clusters: Dict[int, List[str]] = {i: [] for i in range(N_CLUSTERS)}
    for chunk, label in zip(chunks, labels.tolist()):
        clusters[int(label)].append(chunk)

    # Log cluster sizes for diagnostics
    for cid, cchunks in clusters.items():
        logger.info("  Cluster %d → %d chunks", cid, len(cchunks))

    return clusters


# ---------------------------------------------------------------------------
# Multi-format Document Extractors
# ---------------------------------------------------------------------------

import zipfile
import xml.etree.ElementTree as ET

def extract_text_from_docx(docx_bytes: bytes) -> str:
    """Parse raw DOCX bytes by reading word/document.xml from the zip archive."""
    try:
        with zipfile.ZipFile(io.BytesIO(docx_bytes)) as docx:
            xml_content = docx.read("word/document.xml")
            root = ET.fromstring(xml_content)
            
            # DOCX XML namespaces
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            
            # Find all paragraph elements and get their text
            paragraphs = []
            for p in root.findall(".//w:p", ns):
                texts = [t.text for t in p.findall(".//w:t", ns) if t.text]
                if texts:
                    paragraphs.append("".join(texts))
            
            if not paragraphs:
                raise ValueError("DOCX appears to be empty or contains no extractable text.")
            return "\n\n".join(paragraphs)
    except Exception as exc:
        raise ValueError(f"Failed to parse DOCX: {exc}")


def extract_text_from_html(html_bytes: bytes) -> str:
    """Parse HTML bytes and return cleaned text content."""
    try:
        soup = BeautifulSoup(html_bytes, "html.parser")
        # Extract meaningful tags
        content_tags = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'pre', 'code'])
        texts = [tag.get_text(separator=' ', strip=True) for tag in content_tags]
        clean_text = "\n".join(t for t in texts if t)
        if not clean_text:
            clean_text = soup.get_text(separator='\n', strip=True)
        if not clean_text:
            raise ValueError("HTML appears to have no extractable text.")
        return clean_text
    except Exception as exc:
        raise ValueError(f"Failed to parse HTML: {exc}")


def extract_text_from_txt(txt_bytes: bytes) -> str:
    """Decode raw TXT/Markdown bytes to string."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            text = txt_bytes.decode(encoding)
            if text.strip():
                return text
        except UnicodeDecodeError:
            continue
    raise ValueError("Failed to decode text file. Ensure it is a valid text encoding.")


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def ingest_file(file_bytes: bytes, filename: str) -> Dict[int, List[str]]:
    """
    Full ingestion pipeline supporting PDF, DOCX, TXT, MD, and HTML files.
    """
    logger.info("=== Acumen File Ingestion Pipeline START: '%s' ===", filename)
    ext = filename.lower().split(".")[-1]
    
    if ext == "pdf":
        raw_text = extract_text_from_pdf(file_bytes)
    elif ext == "docx":
        raw_text = extract_text_from_docx(file_bytes)
    elif ext in ("html", "htm"):
        raw_text = extract_text_from_html(file_bytes)
    elif ext in ("txt", "md", "markdown"):
        raw_text = extract_text_from_txt(file_bytes)
    else:
        raise ValueError(f"Unsupported file format: {ext}")
        
    logger.info("Extracted %d characters from '%s'.", len(raw_text), filename)
    
    chunks = chunk_text(raw_text)
    clusters = cluster_chunks(chunks)
    
    logger.info("=== Acumen Ingestion Pipeline COMPLETE — %d clusters ===", len(clusters))
    return clusters




def scrape_website_text(url: str) -> str:
    """Fetch and extract clean text from a web page."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
    except Exception as e:
        raise ValueError(f"Failed to fetch URL: {str(e)}")

    soup = BeautifulSoup(response.content, "html.parser")
    
    # Extract only meaningful content tags
    content_tags = soup.find_all(['h1', 'h2', 'h3', 'p', 'li'])
    texts = [tag.get_text(separator=' ', strip=True) for tag in content_tags]
    
    # Filter out empty strings and concatenate
    clean_text = "\n".join(t for t in texts if t)
    
    if not clean_text:
        raise ValueError("Could not extract any meaningful text from the provided URL.")
        
    return clean_text


def ingest_url(url: str) -> Dict[int, List[str]]:
    """
    Full ingestion pipeline for URLs.
    
    Args:
        url: The website URL to scrape.
        
    Returns:
        A dict mapping cluster_id (0-4) → list of text chunks in that cluster.
    """
    logger.info("=== Acumen URL Ingestion Pipeline START ===")

    raw_text = scrape_website_text(url)
    logger.info("Extracted %d characters from URL.", len(raw_text))

    chunks = chunk_text(raw_text)
    clusters = cluster_chunks(chunks)

    logger.info("=== Acumen URL Ingestion Pipeline COMPLETE — %d clusters ===", len(clusters))
    return clusters
