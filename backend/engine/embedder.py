import os
import logging
from typing import List
import numpy as np
from langchain_google_genai import GoogleGenerativeAIEmbeddings

logger = logging.getLogger(__name__)

_document_embeddings = None
_query_embeddings = None

def get_document_embedder() -> GoogleGenerativeAIEmbeddings:
    """Return the document embedding model singleton (task_type optimized for indexing)."""
    global _document_embeddings
    if _document_embeddings is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not set in environment variables.")
        _document_embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-002",
            task_type="RETRIEVAL_DOCUMENT",
            google_api_key=api_key
        )
        logger.info("Initialized Gemini Embedding-002 document embedder.")
    return _document_embeddings

def get_query_embedder() -> GoogleGenerativeAIEmbeddings:
    """Return the query embedding model singleton (task_type optimized for search queries)."""
    global _query_embeddings
    if _query_embeddings is None:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not set in environment variables.")
        _query_embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-002",
            task_type="RETRIEVAL_QUERY",
            google_api_key=api_key
        )
        logger.info("Initialized Gemini Embedding-002 query embedder.")
    return _query_embeddings
