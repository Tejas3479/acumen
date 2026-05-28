"""
Acumen SDET Automated Ingestion Verification Suite
===================================================
Tests build_raptor_tree robustness under extreme edge cases (n_chunks < 3).
"""

import sys
import os
import asyncio
import logging

# Ensure parent directory is in sys.path to resolve imports correctly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

# LangChain 0.3 Compatibility Monkeypatch (verbose attribute removed in 0.3)
import langchain
if not hasattr(langchain, "verbose"):
    langchain.verbose = False

from engine.raptor import build_raptor_tree

# Set up logging to stdout
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("acumen.test_ingestion")

async def test_single_chunk_bypass():
    logger.info("--- Test Case 1: Single Chunk Ingestion ---")
    session_id = "test_session_single"
    
    mock_chunks = [
        {
            "text": "FastAPI is a modern, fast (high-performance), web framework for building APIs with Python 3.8+ based on standard Python type hints.",
            "session_id": session_id,
            "source_id": "src_single",
            "source_title": "fastapi_intro.txt",
            "page_num": 1,
            "section_title": "Introduction",
            "char_offset": 0,
            "chunk_index": 0,
            "raptor_level": 0,
            "cluster_id": -1
        }
    ]
    
    # Execute tree builder
    logger.info("Executing build_raptor_tree with 1 chunk...")
    tree_nodes = await build_raptor_tree(mock_chunks, session_id)
    
    # Assertions
    logger.info(f"Generated {len(tree_nodes)} tree nodes.")
    assert len(tree_nodes) == 2, f"Expected exactly 2 nodes (1 Level-1 + 1 Level-2), got {len(tree_nodes)}"
    
    level_1 = tree_nodes[0]
    level_2 = tree_nodes[1]
    
    assert level_1["raptor_level"] == 1, f"Expected Level-1 node, got level {level_1['raptor_level']}"
    assert level_1["cluster_id"] == 0, f"Expected cluster ID 0, got {level_1['cluster_id']}"
    assert level_2["raptor_level"] == 2, f"Expected Level-2 node, got level {level_2['raptor_level']}"
    
    logger.info("✔ Test Case 1 Passed: Single chunk bypassed GMM/KMeans and generated valid nodes successfully!")

async def test_double_chunk_bypass():
    logger.info("\n--- Test Case 2: Double Chunk Ingestion ---")
    session_id = "test_session_double"
    
    mock_chunks = [
        {
            "text": "SQLite is a C-language library that implements a small, fast, self-contained, high-reliability, full-featured, SQL database engine.",
            "session_id": session_id,
            "source_id": "src_double",
            "source_title": "sqlite_info.txt",
            "page_num": 1,
            "section_title": "SQLite Overview",
            "char_offset": 0,
            "chunk_index": 0,
            "raptor_level": 0,
            "cluster_id": -1
        },
        {
            "text": "Chroma is the AI-native open-source embedding database. Chroma makes it easy to build LLM apps by making knowledge, facts, and skills pluggable.",
            "session_id": session_id,
            "source_id": "src_double",
            "source_title": "sqlite_info.txt",
            "page_num": 1,
            "section_title": "Chroma Database",
            "char_offset": 150,
            "chunk_index": 1,
            "raptor_level": 0,
            "cluster_id": -1
        }
    ]
    
    # Execute tree builder
    logger.info("Executing build_raptor_tree with 2 chunks...")
    tree_nodes = await build_raptor_tree(mock_chunks, session_id)
    
    # Assertions
    logger.info(f"Generated {len(tree_nodes)} tree nodes.")
    assert len(tree_nodes) == 3, f"Expected exactly 3 nodes (2 Level-1 + 1 Level-2), got {len(tree_nodes)}"
    
    level_1_first = tree_nodes[0]
    level_1_second = tree_nodes[1]
    level_2 = tree_nodes[2]
    
    assert level_1_first["raptor_level"] == 1, f"Expected Level-1 node, got level {level_1_first['raptor_level']}"
    assert level_1_first["cluster_id"] == 0, f"Expected cluster ID 0, got {level_1_first['cluster_id']}"
    assert level_1_second["raptor_level"] == 1, f"Expected Level-1 node, got level {level_1_second['raptor_level']}"
    assert level_1_second["cluster_id"] == 1, f"Expected cluster ID 1, got {level_1_second['cluster_id']}"
    assert level_2["raptor_level"] == 2, f"Expected Level-2 node, got level {level_2['raptor_level']}"
    
    logger.info("✔ Test Case 2 Passed: Double chunk bypassed GMM/KMeans and generated valid nodes successfully!")

async def main():
    logger.info("=== Starting ACUMEN SDET Ingestion Robustness Test Suite ===")
    try:
        await test_single_chunk_bypass()
        await test_double_chunk_bypass()
        logger.info("\n=======================================================")
        logger.info("🏆 ALL EDGE CASE TESTS PASSED SUCCESSFULLY! 100% GREENLIGHT.")
        logger.info("=======================================================")
    except AssertionError as ae:
        logger.error(f"❌ TEST ASSERTION FAILED: {ae}")
        sys.exit(1)
    except Exception as exc:
        logger.error(f"❌ UNEXPECTED TEST CRASH: {exc}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
