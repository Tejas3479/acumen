"use client";

import { useCallback, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";

import TopicNode from "@/components/TopicNode";
import type { NodeData, WikiPage } from "@/lib/types";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const NODE_TYPES = { topicNode: TopicNode };
const NODE_W = 220;
const NODE_H = 120;

// ── Dagre auto-layout ────────────────────────────────────────────────────────
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  const nodeWidth = 250;
  const nodeHeight = 80;

  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });
  return { layoutedNodes, layoutedEdges: edges };
};

// ── Obsidian [[link]] parser ─────────────────────────────────────────────────
function parseObsidianLinks(text: string): string[] {
  const matches = text.matchAll(/\[\[([^\]]+)\]\]/g);
  return Array.from(matches, (m) => m[1].trim().toLowerCase());
}

interface KnowledgeGraphProps {
  initialNodes: Node<NodeData>[];
  initialEdges: Edge[];
  wikiPages: WikiPage[];
  onNodeClick: (page: WikiPage) => void;
}

export default function KnowledgeGraph({
  initialNodes,
  initialEdges,
  wikiPages,
  onNodeClick,
}: KnowledgeGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [animating, setAnimating] = useState(false);
  const rfRef = useRef<{ fitView: () => void } | null>(null);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: "#06b6d4" } }, eds)),
    [setEdges]
  );

  const { fitView } = useReactFlow();

  // Dagre layout button
  const handleLayout = useCallback(() => {
    setAnimating(true);
    const { layoutedNodes, layoutedEdges } = getLayoutedElements(nodes, edges);
    setNodes(layoutedNodes.map((n) => ({ ...n, style: { transition: "all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)" } })));
    setEdges(layoutedEdges);
    
    // Animate view after nodes move
    setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
      setAnimating(false);
    }, 100);
  }, [nodes, edges, setNodes, setEdges, fitView]);

  // Node click → find matching wiki page
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<NodeData>) => {
      const page = wikiPages.find((p) => p.cluster_id === node.data.cluster_id);
      if (page) onNodeClick(page);
    },
    [wikiPages, onNodeClick]
  );

  // Called by the Sheet when the user types [[Node Name]]
  const addObsidianEdge = useCallback(
    (sourceClusterId: number, noteText: string) => {
      const refs = parseObsidianLinks(noteText);
      refs.forEach((ref) => {
        const targetNode = nodes.find(
          (n) => n.data.label.toLowerCase().includes(ref)
        );
        if (!targetNode) return;
        const sourceNode = nodes.find(
          (n) => n.data.cluster_id === sourceClusterId
        );
        if (!sourceNode) return;
        const edgeId = `obsidian-${sourceNode.id}-${targetNode.id}`;
        setEdges((eds) => {
          if (eds.find((e) => e.id === edgeId)) return eds;
          return [
            ...eds,
            {
              id: edgeId,
              source: sourceNode.id,
              target: targetNode.id,
              animated: true,
              label: "linked",
              style: { stroke: "#10b981" },
              labelStyle: { fill: "#10b981", fontSize: 11 },
            },
          ];
        });
      });
    },
    [nodes, setEdges]
  );

  // Expose addObsidianEdge via ref-like callback on a stable element
  // (parent uses this via prop drilling; see page.tsx)
  (KnowledgeGraph as { _addObsidianEdge?: typeof addObsidianEdge })._addObsidianEdge =
    addObsidianEdge;

  return (
    <div className="relative w-full h-full">
      {/* Dagre layout button (The Magic Wand) */}
      {nodes.length > 0 && (
        <div className="absolute top-4 right-4 z-50">
          <Button
            variant="secondary"
            onClick={handleLayout}
            disabled={animating}
            className="group px-4 py-2 bg-[#0a0a0b]/60 backdrop-blur-xl border border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-white rounded-xl shadow-2xl transition-all duration-300"
          >
            <Wand2 className={`w-4 h-4 mr-2 transition-transform duration-500 ${animating ? "rotate-180 text-indigo-400" : "group-hover:rotate-12"}`} />
            <span className="text-xs font-mono uppercase tracking-wider">Clean Layout</span>
          </Button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(255,255,255,0.06)"
        />
        <Controls />
        <MiniMap
          nodeColor={() => "#7c3aed"}
          maskColor="rgba(10,10,15,0.7)"
        />
      </ReactFlow>
    </div>
  );
}

// Expose addObsidianEdge as a static method for the parent
KnowledgeGraph.addObsidianEdge = (
  sourceClusterId: number,
  noteText: string
) => {
  const fn = (KnowledgeGraph as { _addObsidianEdge?: (a: number, b: string) => void })
    ._addObsidianEdge;
  if (fn) fn(sourceClusterId, noteText);
};
