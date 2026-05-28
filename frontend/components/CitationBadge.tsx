"use client";

import { useState } from "react";
import { FileText, ExternalLink } from "lucide-react";

interface CitationBadgeProps {
  sourceTitle: string;
  pageNum: number;
}

export default function CitationBadge({ sourceTitle, pageNum }: CitationBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    const ev = new CustomEvent("acumen-highlight-citation", {
      detail: { pageNum, sourceTitle }
    });
    window.dispatchEvent(ev);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    const ev = new CustomEvent("acumen-clear-citation");
    window.dispatchEvent(ev);
  };

  const handleSelect = () => {
    const ev = new CustomEvent("acumen-focus-citation", {
      detail: { pageNum, sourceTitle }
    });
    window.dispatchEvent(ev);
  };

  return (
    <span
      className="relative inline-block mx-1 select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleSelect}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#7c3aed]/10 border border-[#7c3aed]/30 hover:bg-[#7c3aed]/20 text-[#a78bfa] text-[10px] font-mono font-semibold transition-all duration-200 align-middle active:scale-95 shadow-sm cursor-pointer"
      >
        <FileText className="w-3 h-3 text-[#a78bfa] shrink-0" />
        <span>p.{pageNum}</span>
      </button>

      {/* Glassmorphic Hover Tooltip Card */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-3 rounded-xl bg-[#0c0d14]/95 border border-white/10 backdrop-blur-xl shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-200 pointer-events-none">
          <div className="flex items-center gap-1.5 text-[#a78bfa] font-mono text-[9px] font-bold uppercase tracking-wider mb-1">
            <FileText className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{sourceTitle}</span>
            <span className="ml-auto bg-white/5 px-1.5 py-0.5 rounded text-slate-400">Page {pageNum}</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Click to view this verified document segment in the workspace vault context.
          </p>
          <div className="mt-2 flex items-center gap-1 text-[9px] text-slate-500 font-mono">
            <ExternalLink className="w-2.5 h-2.5" />
            <span>Interactive Citation Badge</span>
          </div>
        </div>
      )}
    </span>
  );
}
