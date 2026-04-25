"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { NodeData } from "@/lib/types";

function TopicNode({ data, selected }: NodeProps<NodeData>) {
  return (
    <div
      className={`
        relative min-w-[180px] max-w-[220px] rounded-2xl px-4 py-3
        transition-all duration-300 cursor-pointer
        ${
          selected
            ? "border border-[#7c3aed] shadow-[0_0_20px_rgba(124,58,237,0.5)]"
            : "border border-white/10 hover:border-[#7c3aed]/60 hover:shadow-[0_0_14px_rgba(124,58,237,0.25)]"
        }
      `}
      style={{
        background: selected
          ? "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(17,17,24,0.95) 100%)"
          : "rgba(17,17,24,0.9)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-6 right-6 h-[2px] rounded-full"
        style={{
          background: "linear-gradient(90deg, transparent, #7c3aed, #38bdf8, transparent)",
          opacity: selected ? 1 : 0.5,
        }}
      />

      {/* Cluster badge */}
      <span className="text-[10px] font-mono text-[#7c3aed] tracking-widest uppercase mb-1 block">
        Topic {data.cluster_id}
      </span>

      {/* Title */}
      <p className="text-sm font-semibold text-white leading-tight mb-1 line-clamp-2">
        {data.label}
      </p>

      {/* Summary preview */}
      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
        {data.summary}
      </p>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-[#7c3aed] !border-[#7c3aed]"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-[#7c3aed] !border-[#7c3aed]"
      />
    </div>
  );
}

export default memo(TopicNode);
