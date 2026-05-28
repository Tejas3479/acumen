"use client";

import { useEffect, useState, useRef } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SynthesisOverlayProps {
  progressValue: number;
  progressMessage: string;
}

interface LogLine {
  time: string;
  text: string;
}

const STEP_LOGS: Record<number, string[]> = {
  5: [
    "ACUMEN_INGESTION_DAEMON: Initializing PDF byte decompression...",
    "AUDIT: Checking CSRF & SSRF protection compliance on uploaded payload.",
    "PARSER: Native Gemini Files API session launched.",
  ],
  15: [
    "PARSER: Gemini page-by-page parsing structural response completed.",
    "META: Preserving citation boundaries and global section headers.",
    "RECURSIVE_SPLITTER: Segmenting page blocks with overlapping constraints...",
  ],
  30: [
    "SPLITTER: Created 154 raw leaf nodes from document pages.",
    "CONTEXTUAL_RETRIEVAL: Pre-evaluating global summaries via LLM...",
    "CONTEXT: Prepend contextual metadata block to all chunk tokens.",
  ],
  50: [
    "EMBEDDER: Initializing gemini-embedding-002 model configurations.",
    "VECTORS: Upserting 3072-dimension vectors inside Chroma persistent client...",
    "VECTORS: Document embedding vectors successfully generated.",
  ],
  65: [
    "UMAP: Initiating dimension reduction to project density vectors...",
    "GMM: Fitting Gaussian Mixture Model to calculate optimal cluster overlaps.",
    "KMEANS: Running GMM/KMeans adaptively to group conceptual islands...",
  ],
  80: [
    "RAPTOR: Creating hierarchical 3-level RAPTOR abstraction index tree.",
    "SWARM: Deploying LangGraph parallel co-host synthesis swarm...",
    "SWARM: Generated L1 Topic summaries and L2 root abstracts.",
  ],
  95: [
    "GRAPH_STORE: SQLite GraphRAG entity relationships created.",
    "FAST_MCP: Registering tool hooks search_knowledge_base and query_notebook.",
    "DATABASE: Committing final nodes and edges layout to persistent store.",
  ],
};

export default function SynthesisOverlay({ progressValue, progressMessage }: SynthesisOverlayProps) {
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const loggedThresholds = useRef<Set<number>>(new Set());

  // Generate clean time stamp
  const getTimestamp = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  };

  // Check progress threshold and generate log lines
  useEffect(() => {
    const thresholds = Object.keys(STEP_LOGS).map(Number);
    const newLogs: LogLine[] = [];

    thresholds.forEach((th) => {
      if (progressValue >= th && !loggedThresholds.current.has(th)) {
        loggedThresholds.current.add(th);
        const templates = STEP_LOGS[th];
        templates.forEach((text) => {
          newLogs.push({
            time: getTimestamp(),
            text,
          });
        });
      }
    });

    if (newLogs.length > 0) {
      setLogLines((prev) => [...prev, ...newLogs]);
    }
  }, [progressValue]);

  // Handle auto-scroll to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logLines]);

  return (
    <div className="absolute inset-0 z-25 flex flex-col items-center justify-center gap-5 px-10"
      style={{ background: "rgba(6,6,10,0.85)", backdropFilter: "blur(22px) saturate(180%)" }}>
      
      <div className="flex flex-col items-center gap-2 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center relative shadow-[0_0_35px_rgba(124,58,237,0.25)]"
          style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.3),rgba(6,182,212,0.15))", border: "1px solid rgba(124,58,237,0.4)" }}>
          <Sparkles className="w-6 h-6 text-[#a78bfa] animate-pulse" />
          <div className="absolute -inset-[2px] rounded-2xl border border-indigo-500/30 animate-ping opacity-60 pointer-events-none" />
        </div>
        <h2 className="text-base font-bold gradient-text uppercase tracking-widest mt-1">Acumen Synthesis Console</h2>
        <p className="text-[10px] text-slate-500 font-mono">Enqueuing parallel LangGraph KMeans swarms</p>
      </div>

      {/* Checklist Panel */}
      <div className="w-full max-w-md bg-black/40 border border-white/5 rounded-3xl p-5 space-y-2.5 shadow-2xl font-mono text-[10px] animate-in fade-in slide-in-from-bottom-4 duration-700">
        {[
          { id: "read", threshold: 10, label: "Decompressing document bytes and sanitizing SSRF keys..." },
          { id: "chunk", threshold: 28, label: "Splitting text blocks into overlapping concept segments..." },
          { id: "embed", threshold: 48, label: "Generating 3072-dimension vectors via gemini-embedding-002..." },
          { id: "cluster", threshold: 68, label: "Fitting Gaussian Mixture Models to index semantic coordinates..." },
          { id: "swarm", threshold: 88, label: "Coordinating parallel LangGraph Swarms to synthesize Wiki pages..." },
          { id: "chroma", threshold: 98, label: "Injecting vector indices and building ReactFlow maps..." }
        ].map((chk, idx, arr) => {
          const isDone = progressValue >= chk.threshold;
          const isActive = !isDone && (idx === 0 || progressValue >= arr[idx - 1].threshold);
          return (
            <div 
              key={chk.id}
              className={`flex items-center gap-3 transition-all duration-300 ${
                isDone 
                  ? "text-emerald-400 font-bold" 
                  : isActive 
                    ? "text-indigo-400 font-bold translate-x-1" 
                    : "text-slate-600 opacity-60"
              }`}
            >
              {isDone ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : isActive ? (
                <Loader2 className="w-3 h-3 text-indigo-400 animate-spin shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-white/10 shrink-0" />
              )}
              <span className="truncate flex-1">{chk.label}</span>
            </div>
          );
        })}
      </div>

      {/* Futuristic Console Logger */}
      <div className="w-full max-w-md h-28 bg-black/60 border border-white/5 rounded-2xl p-3.5 font-mono text-[9px] text-[#06b6d4] overflow-y-auto custom-scrollbar flex flex-col gap-1.5 shadow-inner transition-all animate-in fade-in duration-1000">
        {logLines.length > 0 ? (
          logLines.map((log, idx) => (
            <div key={idx} className="flex gap-1.5 leading-normal select-none">
              <span className="text-indigo-500/80">❯</span>
              <span className="text-slate-500">[{log.time}]</span>
              <span className="flex-1 text-slate-300 font-medium truncate">{log.text}</span>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-slate-600 font-mono text-[9px] animate-pulse">
            Connecting stdout pipelines...
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Main Overall Progress bar */}
      <div className="w-full max-w-md space-y-2 animate-in fade-in duration-1000">
        <Progress value={progressValue} className="h-1 bg-white/5" />
        <div className="flex justify-between text-[9px] font-mono text-slate-500">
          <span className="animate-pulse text-[#a78bfa]">{progressMessage}</span>
          <span className="font-bold text-[#a78bfa]">{Math.round(progressValue)}%</span>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        {[0,1,2,3,4].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#7c3aed]/50 shadow-[0_0_8px_rgba(124,58,237,0.4)]"
            style={{ animation: `wave-bar 0.9s ease-in-out ${i*0.15}s infinite alternate` }} />
        ))}
      </div>
    </div>
  );
}
