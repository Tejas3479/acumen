import os
import sqlite3
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.getenv("ACUMEN_DATA_DIR", "./data"), "acumen.db")

def init_graph_db():
    """Initializes the GraphRAG tables in the persistent SQLite database."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create graph_nodes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT,
        label TEXT,
        entity_type TEXT,
        summary TEXT,
        session_id TEXT,
        PRIMARY KEY (id, session_id)
    )
    """)
    
    # Create graph_edges table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS graph_edges (
        source TEXT,
        target TEXT,
        relationship TEXT,
        session_id TEXT,
        PRIMARY KEY (source, target, relationship, session_id)
    )
    """)
    
    conn.commit()
    conn.close()
    logger.info("GraphRAG SQLite tables initialized successfully.")

def save_graph_elements(session_id: str, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]):
    """Inserts or replaces extracted entity nodes and relationship edges into the SQLite DB."""
    init_graph_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Save nodes
    for n in nodes:
        cursor.execute("""
        INSERT OR REPLACE INTO graph_nodes (id, label, entity_type, summary, session_id)
        VALUES (?, ?, ?, ?, ?)
        """, (
            str(n.get("id", "")),
            str(n.get("label", "")),
            str(n.get("entity_type", "concept")),
            str(n.get("summary", "")),
            session_id
        ))
        
    # Save edges
    for e in edges:
        cursor.execute("""
        INSERT OR REPLACE INTO graph_edges (source, target, relationship, session_id)
        VALUES (?, ?, ?, ?)
        """, (
            str(e.get("source", "")),
            str(e.get("target", "")),
            str(e.get("relationship", "")),
            session_id
        ))
        
    conn.commit()
    conn.close()
    logger.info("Successfully persisted %d nodes and %d edges to SQLite for session %s.", len(nodes), len(edges), session_id)

def get_graph_data(session_id: str) -> Dict[str, Any]:
    """Retrieves all active nodes and edges in GraphML/JSON compatible dict format for a session."""
    init_graph_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, label, entity_type, summary FROM graph_nodes WHERE session_id = ?", (session_id,))
    nodes = [dict(row) for row in cursor.fetchall()]
    
    cursor.execute("SELECT source, target, relationship FROM graph_edges WHERE session_id = ?", (session_id,))
    edges = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return {"nodes": nodes, "edges": edges}

def clear_session_graph(session_id: str):
    """Deletes all graph elements matching the session_id."""
    init_graph_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM graph_nodes WHERE session_id = ?", (session_id,))
    cursor.execute("DELETE FROM graph_edges WHERE session_id = ?", (session_id,))
    conn.commit()
    conn.close()
    logger.info("Cleared graph database elements for session: %s", session_id)

def traverse_bfs(session_id: str, seed_entity_labels: List[str], depth: int = 2) -> List[str]:
    """
    Performs a Breadth-First Search (BFS) starting from nodes matching seed_entity_labels.
    Traverses connected edges up to depth and compiles the relational context descriptions.
    
    Returns: List of formatted text strings describing the local entity-relation graph.
    """
    if not seed_entity_labels:
        return []
        
    init_graph_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Resolve seed labels to seed IDs
    seed_ids = set()
    placeholders = ",".join("?" for _ in seed_entity_labels)
    cursor.execute(f"""
    SELECT id FROM graph_nodes 
    WHERE session_id = ? AND LOWER(label) IN ({placeholders})
    """, [session_id] + [l.strip().lower() for l in seed_entity_labels])
    
    for row in cursor.fetchall():
        seed_ids.add(row["id"])
        
    if not seed_ids:
        conn.close()
        return []
        
    # 2. Perform BFS traversal up to depth
    visited_nodes = set(seed_ids)
    current_frontier = set(seed_ids)
    all_edges = []
    
    for d in range(depth):
        if not current_frontier:
            break
            
        placeholders_frontier = ",".join("?" for _ in current_frontier)
        query = f"""
        SELECT source, target, relationship FROM graph_edges 
        WHERE session_id = ? 
        AND (source IN ({placeholders_frontier}) OR target IN ({placeholders_frontier}))
        """
        params = [session_id] + list(current_frontier) + list(current_frontier)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        next_frontier = set()
        for r in rows:
            all_edges.append(dict(r))
            src, tgt = r["source"], r["target"]
            
            if src not in visited_nodes:
                visited_nodes.add(src)
                next_frontier.add(src)
            if tgt not in visited_nodes:
                visited_nodes.add(tgt)
                next_frontier.add(tgt)
                
        current_frontier = next_frontier
        
    # 3. Pull details for all visited nodes
    if not visited_nodes:
        conn.close()
        return []
        
    placeholders_visited = ",".join("?" for _ in visited_nodes)
    cursor.execute(f"""
    SELECT id, label, entity_type, summary FROM graph_nodes 
    WHERE session_id = ? AND id IN ({placeholders_visited})
    """, [session_id] + list(visited_nodes))
    
    node_map = {row["id"]: dict(row) for row in cursor.fetchall()}
    conn.close()
    
    # 4. Formulate contextual sentences describing the graph neighborhood
    relational_descriptions = []
    
    # Summarize individual entity details
    for nid, ndata in node_map.items():
        relational_descriptions.append(
            f"Entity [{ndata['label']}] (Type: {ndata['entity_type']}): {ndata['summary']}"
        )
        
    # Summarize relationships
    for e in all_edges:
        src_node = node_map.get(e["source"])
        tgt_node = node_map.get(e["target"])
        if src_node and tgt_node:
            relational_descriptions.append(
                f"Relationship: [{src_node['label']}] --({e['relationship']})--> [{tgt_node['label']}]"
            )
            
    return relational_descriptions
