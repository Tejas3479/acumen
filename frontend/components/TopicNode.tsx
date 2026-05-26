"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { 
  Database, Server, Sparkles, Code2, Cpu
} from "lucide-react";
import type { NodeData } from "@/lib/types";

// Key-category Lucide Icon mapper
function getTopicIcon(title = "", summary = "") {
  const t = (title + " " + summary).toLowerCase();
  
  if (
    t.includes("database") || 
    t.includes("sql") || 
    t.includes("schema") || 
    t.includes("sqlite") || 
    t.includes("postgres") || 
    t.includes("store") || 
    t.includes("shard")
  ) {
    return { Icon: Database, color: "#10b981", bg: "rgba(16,185,129,0.15)" }; // Emerald
  }
  
  if (
    t.includes("api") || 
    t.includes("network") || 
    t.includes("cloud") || 
    t.includes("server") || 
    t.includes("endpoint") || 
    t.includes("routing") || 
    t.includes("http")
  ) {
    return { Icon: Server, color: "#06b6d4", bg: "rgba(6,182,212,0.15)" }; // Cyan
  }
  
  if (
    t.includes("ai") || 
    t.includes("machine") || 
    t.includes("learning") || 
    t.includes("embedding") || 
    t.includes("kmeans") || 
    t.includes("vector") || 
    t.includes("model") || 
    t.includes("llm") || 
    t.includes("gemini")
  ) {
    return { Icon: Sparkles, color: "#a78bfa", bg: "rgba(167,139,250,0.15)" }; // Purple
  }
  
  if (
    t.includes("code") || 
    t.includes("python") || 
    t.includes("script") || 
    t.includes("develop") || 
    t.includes("sprint") || 
    t.includes("git") || 
    t.includes("task")
  ) {
    return { Icon: Code2, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" }; // Amber
  }

  return { Icon: Cpu, color: "#3b82f6", bg: "rgba(59,130,246,0.15)" }; // Blue
}

function TopicNode({ data, selected }: NodeProps<NodeData>) {
  const { Icon, color, bg } = getTopicIcon(data.label, data.summary);
  const terms = data.key_terms || [];

  return (
    <div
      className={`
        relative min-w-[210px] max-w-[240px] rounded-3xl p-4
        transition-all duration-500 cursor-pointer select-none
        border group hover:scale-[1.03] active:scale-95
        ${
          selected
            ? "border-indigo-500 shadow-[0_0_25px_rgba(99,102,241,0.35)]"
            : "border-white/10 hover:border-indigo-500/50 hover:shadow-[0_0_18px_rgba(99,102,241,0.15)]"
        }
      `}
      style={{
        background: selected
          ? "linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(10,10,16,0.98) 100%)"
          : "rgba(11,11,18,0.92)",
        backdropFilter: "blur(16px) saturate(180%)",
      }}
    >
      {/* Elegantly animated pulsing halo around active selected logic terminals */}
      {selected && (
        <div className="absolute -inset-[1px] rounded-3xl border border-indigo-400 opacity-75 animate-ping pointer-events-none" />
      )}

      {/* Top accent bar */}
      <div
        className="absolute top-0 left-8 right-8 h-[2px] rounded-full transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, #ffffff, transparent)`,
          opacity: selected ? 1 : 0.4,
        }}
      />

      {/* Header Badge Row */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <span className="text-[9px] font-mono text-slate-500 tracking-[0.2em] uppercase font-bold">
          Topic #{data.cluster_id}
        </span>
        
        {/* Dynamic Category Mini-Icon */}
        <div 
          className="w-6 h-6 rounded-lg flex items-center justify-center border border-white/5 transition-transform duration-300 group-hover:rotate-12"
          style={{ background: bg }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
      </div>

      {/* Title */}
      <p className="text-xs sm:text-sm font-bold text-white leading-snug mb-1.5 line-clamp-2 select-text">
        {data.label}
      </p>

      {/* Summary preview */}
      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed mb-3.5 select-text">
        {data.summary}
      </p>

      {/* Inline Pill Badges (Key terms inside the node) */}
      {terms.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 border-t border-white/5 pt-2.5">
          {terms.slice(0, 3).map((term) => (
            <span 
              key={term}
              className="text-[8px] font-medium tracking-wide px-2 py-0.5 rounded-full border bg-white/[0.01] border-white/5 text-slate-400 max-w-[80px] truncate"
              title={term}
            >
              {term}
            </span>
          ))}
          {terms.length > 3 && (
            <span className="text-[8px] text-slate-600 font-mono self-center ml-1">
              +{terms.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Connectors */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-indigo-500 !border-indigo-400 !opacity-80 transition-transform group-hover:scale-125"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-indigo-500 !border-indigo-400 !opacity-80 transition-transform group-hover:scale-125"
      />
    </div>
  );
}

export default memo(TopicNode);
