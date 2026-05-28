/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { Wand2, Download, Search, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { WikiPage } from "@/lib/types";

// Dynamically import ForceGraph3D to completely prevent SSR window crashes
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full gap-4 bg-[#06060a]/20 backdrop-blur-md">
      <div className="w-12 h-12 rounded-2xl skeleton animate-pulse bg-indigo-500/10 border border-indigo-500/20" />
      <div className="space-y-2 w-48 text-center">
        <div className="h-3 skeleton w-full bg-indigo-500/10 rounded" />
        <div className="h-2 skeleton w-3/4 bg-indigo-500/10 rounded mx-auto" />
      </div>
    </div>
  ),
});

interface NodeData {
  id: string;
  label: string;
  summary: string;
  cluster_id: number;
}

interface EdgeData {
  id: string;
  source: string;
  target: string;
  label: string;
}

interface KnowledgeGraphProps {
  initialNodes: any[];
  initialEdges: any[];
  wikiPages: WikiPage[];
  onNodeClick: (page: WikiPage) => void;
  onLayoutSave?: (layout: Record<string, { x: number; y: number }>) => void;
  sessionId: string;
}

const CLUSTER_COLORS = [
  "#7c3aed", // Dynamic Purple (Primary)
  "#06b6d4", // Glowing Cyan (Accent)
  "#10b981", // Success Emerald
  "#f59e0b", // Warning Amber
  "#6366f1", // Deep Indigo
  "#ec4899", // Neon Pink
  "#14b8a6", // Bright Teal
];

export default function KnowledgeGraph({
  initialNodes,
  initialEdges,
  wikiPages,
  onNodeClick,
  onLayoutSave,
  sessionId,
}: KnowledgeGraphProps) {
  const fgRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [cameraDrifting, setCameraDrifting] = useState(true);
  const driftAngleRef = useRef(0);

  // Sync format to ForceGraph3D requirements
  const [graphData, setGraphData] = useState<{ nodes: NodeData[]; links: EdgeData[] }>({
    nodes: [],
    links: [],
  });

  useEffect(() => {
    // Map ReactFlow-styled props into raw Graph elements
    const formattedNodes = initialNodes.map((n) => ({
      id: n.id,
      label: n.data?.label || "Topic Cluster",
      summary: n.data?.summary || "",
      cluster_id: n.data?.cluster_id ?? 0,
    }));

    const formattedLinks = initialEdges.map((e) => ({
      id: e.id,
      source: typeof e.source === "object" ? e.source.id : e.source,
      target: typeof e.target === "object" ? e.target.id : e.target,
      label: e.label || "connected",
    }));

    setGraphData({ nodes: formattedNodes, links: formattedLinks });
  }, [initialNodes, initialEdges]);

  // Set up 3D D3 Forces
  useEffect(() => {
    if (fgRef.current) {
      // Adjust strength of charge (repulsion) and links
      fgRef.current.d3Force("charge").strength(-250);
      fgRef.current.d3Force("link").distance(120);
    }
  }, [graphData]);

  // Smooth camera orbital drift loop
  useEffect(() => {
    let animationId: number;
    const distance = 420;

    const tick = () => {
      if (cameraDrifting && fgRef.current) {
        driftAngleRef.current += 0.0012;
        fgRef.current.cameraPosition({
          x: distance * Math.sin(driftAngleRef.current),
          z: distance * Math.cos(driftAngleRef.current),
        });
      }
      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [cameraDrifting]);



  // Dynamic Highlighting logic based on Search Query
  const isSearchActive = searchQuery.trim() !== "";
  
  const getHighlightStatus = useCallback((node: any) => {
    if (!isSearchActive) return { active: true, scale: 1.0 };
    
    const term = searchQuery.toLowerCase();
    const isMatch =
      node.label.toLowerCase().includes(term) ||
      node.summary.toLowerCase().includes(term);
      
    return {
      active: isMatch,
      scale: isMatch ? 1.4 : 0.2,
    };
  }, [isSearchActive, searchQuery]);

  // Custom Mesh Generator: Renders translucent glass spheres with refraction
  const generateNodeMesh = useCallback((node: any) => {
    const { active, scale } = getHighlightStatus(node);
    const colorIndex = Math.abs(node.cluster_id) % CLUSTER_COLORS.length;
    const baseColor = CLUSTER_COLORS[colorIndex];
    
    // Physical Refraction Glass Material (Wow-Factor Centerpiece)
    const nodeMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(baseColor),
      transparent: true,
      opacity: active ? 0.82 : 0.08,
      roughness: 0.15,
      metalness: 0.1,
      transmission: active ? 0.88 : 0.2, // Refractive transparency
      thickness: active ? 2.5 : 0.2,     // Glass thickness
      clearcoat: active ? 1.0 : 0.0,
      clearcoatRoughness: 0.1,
    });

    const isHovered = hoveredNode && hoveredNode.id === node.id;
    const sphereRadius = isHovered ? 14 : 9;
    const geom = new THREE.SphereGeometry(sphereRadius * scale, 32, 32);
    const mesh = new THREE.Mesh(geom, nodeMaterial);

    // If active and searched, add a neon glowing halo wireframe shell
    if (active && isSearchActive) {
      const wireMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(baseColor),
        wireframe: true,
        transparent: true,
        opacity: 0.25,
      });
      const wireGeom = new THREE.SphereGeometry(sphereRadius * scale * 1.35, 12, 12);
      const wireMesh = new THREE.Mesh(wireGeom, wireMaterial);
      mesh.add(wireMesh);
    }

    return mesh;
  }, [getHighlightStatus, isSearchActive, hoveredNode]);

  // Aim camera smoothly at selected node
  const handleNodeClick = useCallback((node: any) => {
    setCameraDrifting(false); // Pause auto-rotation
    
    const distance = 160;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
    
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new pos
        node, // lookAt
        1200  // smooth transit duration
      );
    }

    // Resolve matching WikiPage context to trigger page drawers
    const page = wikiPages.find((p) => p.cluster_id === node.cluster_id);
    if (page) {
      onNodeClick(page);
    }
  }, [wikiPages, onNodeClick]);

  // ── Graph-Chat Citation Interactive Highlighting ──
  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const { pageNum, sourceTitle } = (e as CustomEvent).detail;
      const match = wikiPages.find(p => 
        p.topic_title.toLowerCase().includes(sourceTitle.toLowerCase()) || 
        p.summary.toLowerCase().includes(sourceTitle.toLowerCase())
      );
      if (match) {
        setSearchQuery(match.topic_title);
      }
    };

    const handleClear = () => {
      setSearchQuery("");
    };

    const handleFocus = (e: Event) => {
      const { pageNum, sourceTitle } = (e as CustomEvent).detail;
      const match = wikiPages.find(p => 
        p.topic_title.toLowerCase().includes(sourceTitle.toLowerCase()) || 
        p.summary.toLowerCase().includes(sourceTitle.toLowerCase())
      );
      if (match) {
        const node = graphData.nodes.find(n => n.cluster_id === match.cluster_id);
        if (node) {
          handleNodeClick(node);
        }
      }
    };

    window.addEventListener("acumen-highlight-citation", handleHighlight);
    window.addEventListener("acumen-clear-citation", handleClear);
    window.addEventListener("acumen-focus-citation", handleFocus);
    return () => {
      window.removeEventListener("acumen-highlight-citation", handleHighlight);
      window.removeEventListener("acumen-clear-citation", handleClear);
      window.removeEventListener("acumen-focus-citation", handleFocus);
    };
  }, [wikiPages, graphData.nodes, handleNodeClick]);

  // Camera Controls
  const handleZoomIn = () => {
    if (fgRef.current) {
      const { x, y, z } = fgRef.current.cameraPosition();
      fgRef.current.cameraPosition({ x: x * 0.8, y: y * 0.8, z: z * 0.8 }, null, 500);
    }
  };

  const handleZoomOut = () => {
    if (fgRef.current) {
      const { x, y, z } = fgRef.current.cameraPosition();
      fgRef.current.cameraPosition({ x: x * 1.25, y: y * 1.25, z: z * 1.25 }, null, 500);
    }
  };

  const handleResetCamera = () => {
    setCameraDrifting(true);
    if (fgRef.current) {
      fgRef.current.cameraPosition({ x: 0, y: 0, z: 420 }, { x: 0, y: 0, z: 0 }, 1000);
    }
  };

  // GraphML Export Handler (Neo4j / yEd Interoperable)
  const handleExportGraphML = () => {
    try {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="summary" for="node" attr.name="summary" attr.type="string"/>
  <key id="cluster_id" for="node" attr.name="cluster_id" attr.type="int"/>
  <key id="edge_label" for="edge" attr.name="label" attr.type="string"/>
  <graph id="G" edgedefault="directed">
`;
      const escapeXml = (str: string) =>
        str
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&apos;");

      graphData.nodes.forEach((n) => {
        xml += `    <node id="${n.id}">
      <data key="label">${escapeXml(n.label)}</data>
      <data key="summary">${escapeXml(n.summary)}</data>
      <data key="cluster_id">${n.cluster_id}</data>
    </node>\n`;
      });

      graphData.links.forEach((l) => {
        xml += `    <edge id="${l.id}" source="${l.source}" target="${l.target}">
      <data key="edge_label">${escapeXml(l.label)}</data>
    </edge>\n`;
      });

      xml += `  </graph>
</graphml>`;

      const blob = new Blob([xml], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `acumen_graph_3d_${Date.now()}.graphml`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("WebGL graph exported in premium GraphML format!");
    } catch {
      toast.error("Failed to export GraphML.");
    }
  };

  return (
    <div className="relative w-full h-full min-h-[300px]">
      {/* Search Input Bar (Premium Cosmic HUD overlay) */}
      {graphData.nodes.length > 0 && (
        <div className="absolute top-4 left-4 z-40 flex items-center w-72 h-10 px-3 bg-[#0a0a0b]/60 backdrop-blur-xl border border-white/10 rounded-xl focus-within:border-indigo-500/50 focus-within:bg-indigo-500/5 transition-all duration-300 shadow-2xl">
          <Search className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search WebGL galaxy nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs bg-transparent border-none outline-none text-slate-300 placeholder-slate-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[10px] text-slate-500 hover:text-white font-mono uppercase tracking-wider shrink-0"
            >
              clear
            </button>
          )}
        </div>
      )}

      {/* Control Board & Export Panels */}
      {graphData.nodes.length > 0 && (
        <div className="absolute top-4 right-4 z-40 flex gap-2">
          {/* Preset Camera controls */}
          <div className="flex bg-[#0a0a0b]/60 backdrop-blur-xl border border-white/10 rounded-xl p-0.5 shadow-2xl h-10 items-center">
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetCamera}
              title="Reset View"
              className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer border-l border-white/5"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <Button
            variant="secondary"
            onClick={handleExportGraphML}
            className="group px-3 py-1.5 bg-[#0a0a0b]/60 backdrop-blur-xl border border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-white rounded-xl shadow-2xl transition-all duration-300 h-10"
          >
            <Download className="w-4 h-4 mr-2 text-emerald-400 group-hover:translate-y-0.5 transition-transform" />
            <span className="text-[10px] font-mono uppercase tracking-wider">Export GraphML</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => setCameraDrifting((d) => !d)}
            className="group px-3 py-1.5 bg-[#0a0a0b]/60 backdrop-blur-xl border border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-white rounded-xl shadow-2xl transition-all duration-300 h-10"
          >
            <Wand2
              className={`w-4 h-4 mr-2 text-indigo-400 transition-transform duration-500 ${
                cameraDrifting ? "animate-spin" : ""
              }`}
            />
            <span className="text-[10px] font-mono uppercase tracking-wider">
              {cameraDrifting ? "Lock Galaxy" : "Drift Galaxy"}
            </span>
          </Button>
        </div>
      )}

      {/* Floating HUD Tooltip */}
      {hoveredNode && (
        <div className="absolute bottom-4 left-4 z-40 max-w-sm p-4 bg-[#0a0a0b]/80 backdrop-blur-xl border border-indigo-500/20 rounded-2xl shadow-[0_0_30px_rgba(124,58,237,0.15)] pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          <p className="text-[10px] font-mono uppercase tracking-wider text-indigo-400 mb-1">
            Cluster {hoveredNode.cluster_id} Node Details
          </p>
          <h4 className="text-sm font-semibold text-white mb-1">{hoveredNode.label}</h4>
          <p className="text-xs text-slate-400 leading-relaxed font-medium">
            {hoveredNode.summary.length > 160
              ? `${hoveredNode.summary.slice(0, 160)}...`
              : hoveredNode.summary}
          </p>
        </div>
      )}

      {/* ForceGraph3D Renderer */}
      {graphData.nodes.length > 0 ? (
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          nodeThreeObject={generateNodeMesh}
          onNodeClick={handleNodeClick}
          onNodeHover={setHoveredNode}
          linkColor={(link: any) => {
            // Check if active
            const sourceMatches =
              !isSearchActive ||
              link.source.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
              link.source.summary.toLowerCase().includes(searchQuery.toLowerCase());
            const targetMatches =
              !isSearchActive ||
              link.target.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
              link.target.summary.toLowerCase().includes(searchQuery.toLowerCase());
            return sourceMatches && targetMatches ? "rgba(124, 58, 237, 0.45)" : "rgba(255, 255, 255, 0.02)";
          }}
          linkWidth={(link: any) => {
            const sourceMatches =
              !isSearchActive ||
              link.source.label.toLowerCase().includes(searchQuery.toLowerCase());
            const targetMatches =
              !isSearchActive ||
              link.target.label.toLowerCase().includes(searchQuery.toLowerCase());
            return sourceMatches && targetMatches ? 2.2 : 0.5;
          }}
          linkDirectionalParticles={1}
          linkDirectionalParticleWidth={1.5}
          linkDirectionalParticleSpeed={0.015}
          showNavInfo={false}
          enableNodeDrag={true}
          enablePointerInteraction={true}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs select-none">
          No concepts loaded. Upload a source to build network.
        </div>
      )}
    </div>
  );
}
