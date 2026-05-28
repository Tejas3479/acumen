import os
import logging
import json
import uuid
from typing import Dict, List, Any, Optional
from abc import ABC, abstractmethod

import chromadb
from chromadb.api.types import Documents, Embeddings, EmbeddingFunction
from langchain_google_genai import GoogleGenerativeAIEmbeddings

logger = logging.getLogger("acumen.vector_store")

# Constants
CHROMA_PERSIST_PATH = os.environ.get("ACUMEN_CHROMA_PATH", "./chroma_db")

class VectorStoreInterface(ABC):
    """Abstract Vector Database Interface for ACUMEN (future Qdrant/Milvus compatibility)."""
    
    @abstractmethod
    def upsert(self, collection_name: str, ids: List[str], documents: List[str], metadatas: List[Dict[str, Any]]) -> None:
        """Upsert documents and metadatas into the specified collection."""
        pass
        
    @abstractmethod
    def query(self, collection_name: str, query_embedding: List[float], n_results: int, where: Dict[str, Any]) -> Dict[str, Any]:
        """Query the collection using dense vector embeddings."""
        pass
        
    @abstractmethod
    def get(self, collection_name: str, where: Dict[str, Any], include: List[str]) -> Dict[str, Any]:
        """Get documents matching a specific metadata filter."""
        pass
        
    @abstractmethod
    def delete(self, collection_name: str, ids: Optional[List[str]] = None, where: Optional[Dict[str, Any]] = None) -> None:
        """Delete entries matching IDs or metadata filters."""
        pass


class GeminiEmbeddingFunction(EmbeddingFunction):
    """Wrapper to make LangChain embeddings compatible with ChromaDB."""
    def __init__(self, model_name: str = "models/gemini-embedding-002"):
        api_key = os.getenv("GOOGLE_API_KEY")
        self.embedder = GoogleGenerativeAIEmbeddings(model=model_name, google_api_key=api_key)
    def __call__(self, input: Documents) -> Embeddings:
        return self.embedder.embed_documents(list(input))


class ChromaVectorStore(VectorStoreInterface):
    """Production ChromaDB Implementation of the Vector Store Interface."""
    
    def __init__(self, persist_path: str = CHROMA_PERSIST_PATH):
        self.persist_path = persist_path
        self.client = chromadb.PersistentClient(path=self.persist_path)
        logger.info("ChromaVectorStore initialized with PersistentClient at: %s", self.persist_path)
        self._collections: Dict[str, chromadb.Collection] = {}

    def _get_collection(self, collection_name: str) -> chromadb.Collection:
        """Lazily initialize or retrieve a ChromaDB collection."""
        if collection_name not in self._collections:
            embedding_fn = GeminiEmbeddingFunction()
            self._collections[collection_name] = self.client.get_or_create_collection(
                name=collection_name,
                metadata={"hnsw:space": "cosine"},
                embedding_function=embedding_fn
            )
            logger.info("ChromaDB collection '%s' ready.", collection_name)
        return self._collections[collection_name]

    def upsert(self, collection_name: str, ids: List[str], documents: List[str], metadatas: List[Dict[str, Any]]) -> None:
        collection = self._get_collection(collection_name)
        safe_metas = self._cast_metadata_safe(metadatas)
        collection.upsert(ids=ids, documents=documents, metadatas=safe_metas)
        logger.info("Upserted %d documents into ChromaDB collection '%s'", len(ids), collection_name)

    def query(self, collection_name: str, query_embedding: List[float], n_results: int, where: Dict[str, Any]) -> Dict[str, Any]:
        collection = self._get_collection(collection_name)
        return collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where,
            include=["metadatas", "documents"]
        )

    def get(self, collection_name: str, where: Dict[str, Any], include: List[str] = ["metadatas", "documents"]) -> Dict[str, Any]:
        collection = self._get_collection(collection_name)
        return collection.get(where=where, include=include)

    def delete(self, collection_name: str, ids: Optional[List[str]] = None, where: Optional[Dict[str, Any]] = None) -> None:
        collection = self._get_collection(collection_name)
        if ids:
            collection.delete(ids=ids)
            logger.info("Deleted %d items from ChromaDB collection '%s' by IDs", len(ids), collection_name)
        elif where:
            collection.delete(where=where)
            logger.info("Deleted items from ChromaDB collection '%s' matching metadata filters", collection_name)

    def _cast_metadata_safe(self, metadatas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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


class QdrantVectorStore(VectorStoreInterface):
    """Production Qdrant Implementation of the Vector Store Interface."""
    
    def __init__(self):
        try:
            import qdrant_client
            self.url = os.getenv("QDRANT_URL", ":memory:")
            self.api_key = os.getenv("QDRANT_API_KEY")
            
            # Issue #1 Fix: correct constructor matching Qdrant SDK local vs server guidelines
            if self.url == ":memory:":
                self.client = qdrant_client.QdrantClient(":memory:")
                logger.info("QdrantVectorStore initialized in secure Local In-Memory Mode.")
            else:
                self.client = qdrant_client.QdrantClient(url=self.url, api_key=self.api_key)
                logger.info("QdrantVectorStore initialized with Qdrant server at: %s", self.url)
        except ImportError as e:
            logger.critical("qdrant-client library missing. Run pip install qdrant-client first.")
            raise RuntimeError("qdrant-client missing.") from e

    def _ensure_collection(self, collection_name: str) -> None:
        """Lazily create the Qdrant collection with 3072 dims for gemini-embedding-002."""
        if not self.client.collection_exists(collection_name):
            from qdrant_client.models import Distance, VectorParams
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=3072, distance=Distance.COSINE)
            )
            logger.info("Created Qdrant collection '%s' with 3072 dimensions.", collection_name)

    def upsert(self, collection_name: str, ids: List[str], documents: List[str], metadatas: List[Dict[str, Any]]) -> None:
        self._ensure_collection(collection_name)
        
        # Issue #3 Fix: Use document embedder directly instead of Chroma-specific embedding function wrapper
        from engine.embedder import get_document_embedder
        from qdrant_client.models import PointStruct
        
        logger.info("Embedding %d documents for Qdrant upsert...", len(documents))
        embedder = get_document_embedder()
        vectors = embedder.embed_documents(documents)
        
        points = []
        for raw_id, doc, meta, vec in zip(ids, documents, metadatas, vectors):
            # Deterministic namespace UUID mapping to meet Qdrant string UUID constraints
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, raw_id))
            payload = {
                "document": doc,
                "raw_id": raw_id,
                **meta
            }
            points.append(PointStruct(id=point_id, vector=vec, payload=payload))
            
        self.client.upsert(collection_name=collection_name, points=points)
        logger.info("Successfully upserted %d documents to Qdrant collection '%s'", len(ids), collection_name)

    def query(self, collection_name: str, query_embedding: List[float], n_results: int, where: Dict[str, Any]) -> Dict[str, Any]:
        self._ensure_collection(collection_name)
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        
        # Build Filter conditions
        conditions = []
        if where:
            for key, val in where.items():
                conditions.append(
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=val)
                    )
                )
        qdrant_filter = Filter(must=conditions) if conditions else None
        
        search_results = self.client.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            query_filter=qdrant_filter,
            limit=n_results,
            with_payload=True
        )
        
        # Format identical to ChromaDB output structure
        results = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]]
        }
        
        for point in search_results:
            results["ids"][0].append(point.payload.get("raw_id", str(point.id)))
            results["documents"][0].append(point.payload.get("document", ""))
            meta = {k: v for k, v in point.payload.items() if k not in ("document", "raw_id")}
            results["metadatas"][0].append(meta)
            
        return results

    def get(self, collection_name: str, where: Dict[str, Any], include: List[str] = ["metadatas", "documents"]) -> Dict[str, Any]:
        self._ensure_collection(collection_name)
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        
        conditions = []
        if where:
            for key, val in where.items():
                conditions.append(
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=val)
                    )
                )
        qdrant_filter = Filter(must=conditions) if conditions else None
        
        scroll_results, _ = self.client.scroll(
            collection_name=collection_name,
            scroll_filter=qdrant_filter,
            limit=10000,
            with_payload=True,
            with_vectors=False
        )
        
        # Format identical to ChromaDB flat output structure
        results = {
            "ids": [],
            "documents": [],
            "metadatas": []
        }
        
        for point in scroll_results:
            results["ids"].append(point.payload.get("raw_id", str(point.id)))
            results["documents"].append(point.payload.get("document", ""))
            meta = {k: v for k, v in point.payload.items() if k not in ("document", "raw_id")}
            results["metadatas"].append(meta)
            
        return results

    def delete(self, collection_name: str, ids: Optional[List[str]] = None, where: Optional[Dict[str, Any]] = None) -> None:
        if not self.client.collection_exists(collection_name):
            return
            
        if ids:
            # Deterministic namespace UUID mapping to delete matching Qdrant points
            point_ids = [str(uuid.uuid5(uuid.NAMESPACE_DNS, raw_id)) for raw_id in ids]
            self.client.delete(
                collection_name=collection_name,
                points_selector=point_ids
            )
            logger.info("Deleted %d items from Qdrant collection '%s' by IDs", len(ids), collection_name)
        elif where:
            from qdrant_client.models import Filter, FieldCondition, MatchValue
            conditions = []
            for key, val in where.items():
                conditions.append(
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=val)
                    )
                )
            qdrant_filter = Filter(must=conditions) if conditions else None
            self.client.delete(
                collection_name=collection_name,
                points_selector=qdrant_filter
            )
            logger.info("Deleted items from Qdrant collection '%s' matching metadata filters", collection_name)


# Singleton access point for production
_vector_store_instance: Optional[VectorStoreInterface] = None

def get_vector_store() -> VectorStoreInterface:
    """Singleton getter resolving fallback switcher across active database configurations."""
    global _vector_store_instance
    if _vector_store_instance is None:
        db_type = os.getenv("ACUMEN_VECTOR_DB", "chroma").lower()
        if db_type == "qdrant":
            _vector_store_instance = QdrantVectorStore()
        else:
            _vector_store_instance = ChromaVectorStore()
    return _vector_store_instance
