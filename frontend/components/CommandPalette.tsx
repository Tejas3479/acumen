"use client";

import { useEffect, useState, useRef } from "react";
import { Search, Terminal, BookOpen, Database, Download, Headphones, Library, Sparkles } from "lucide-react";
import type { WikiPage } from "@/lib/types";

interface CommandPaletteProps {
  wikiPages: WikiPage[];
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic: (page: WikiPage) => void;
  onTriggerSwarm: (intent: string) => void;
  onViewChange: (view: "workspace" | "library") => void;
}

interface CommandItem {
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  category: "agents" | "navigation" | "utilities";
  action: () => void;
}

export default function CommandPalette({
  wikiPages,
  isOpen,
  onClose,
  onSelectTopic,
  onTriggerSwarm,
  onViewChange,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Toggle Palette on Cmd+K or Ctrl+K
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelectTopic = (p: WikiPage) => {
    onSelectTopic(p);
    onClose();
    setSearch("");
  };

  // Define Quick Swarm and View Navigation Commands
  const commands: CommandItem[] = [
    {
      icon: <BookOpen className="w-4 h-4 text-purple-400" />,
      label: "/study — Generate study flashcards",
      shortcut: "StudyAgent",
      category: "agents",
      action: () => {
        onTriggerSwarm("flashcards");
        onClose();
      },
    },
    {
      icon: <Database className="w-4 h-4 text-cyan-400" />,
      label: "/arch — Recommend ideal CTO tech stack",
      shortcut: "DevOpsAgent",
      category: "agents",
      action: () => {
        onTriggerSwarm("architecture");
        onClose();
      },
    },
    {
      icon: <Download className="w-4 h-4 text-emerald-400" />,
      label: "/obsidian — Compile notes into Obsidian MD",
      shortcut: "DocumentAgent",
      category: "agents",
      action: () => {
        onTriggerSwarm("obsidian_note");
        onClose();
      },
    },
    {
      icon: <Headphones className="w-4 h-4 text-amber-400" />,
      label: "/podcast — Join live dual-host audio desk",
      shortcut: "Live Desk",
      category: "utilities",
      action: () => {
        const toggleBtn = document.querySelector("#live-podcast-trigger") as HTMLButtonElement;
        if (toggleBtn) toggleBtn.click();
        onClose();
      },
    },
    {
      icon: <Library className="w-4 h-4 text-indigo-400" />,
      label: "/library — Switch to notebook catalog libraries",
      shortcut: "Navigate",
      category: "navigation",
      action: () => {
        onViewChange("library");
        onClose();
      },
    },
  ];

  // Filtering nodes and commands
  const filteredCommands = commands.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTopics = wikiPages.filter(
    (p) =>
      p.topic_title.toLowerCase().includes(search.toLowerCase()) ||
      p.summary.toLowerCase().includes(search.toLowerCase())
  );

  const totalItems = filteredCommands.length + filteredTopics.length;

  // Handle Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex < filteredCommands.length) {
        filteredCommands[selectedIndex].action();
      } else {
        const topicIdx = selectedIndex - filteredCommands.length;
        handleSelectTopic(filteredTopics[topicIdx]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Immersive Glassmorphic Command Box */}
      <div
        className="w-full max-w-lg bg-[#07070a]/90 border border-white/10 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(124,58,237,0.18)] transition-all flex flex-col max-h-[460px] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/5 relative bg-white/[0.01]">
          <Search className="w-4 h-4 text-slate-500 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search topic clusters..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full text-xs bg-transparent border-none outline-none text-slate-200 placeholder-slate-500 font-medium"
          />
          <span className="text-[9px] font-mono text-slate-500 px-2 py-0.5 border border-white/10 rounded-lg select-none">
            ESC
          </span>
        </div>

        {/* Results Container */}
        <div className="flex-grow overflow-y-auto custom-scrollbar p-2.5 space-y-3">
          {/* 1. Quick Slash commands */}
          {filteredCommands.length > 0 && (
            <div className="space-y-1">
              <p className="px-3 text-[9px] font-mono uppercase tracking-wider text-indigo-400/80 mb-1.5 flex items-center gap-1.5">
                <Terminal className="w-3 h-3" /> Quick Actions
              </p>
              {filteredCommands.map((cmd, idx) => {
                const isActive = selectedIndex === idx;
                return (
                  <button
                    key={cmd.label}
                    onClick={() => {
                      cmd.action();
                      setSearch("");
                    }}
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl text-left transition-all ${
                      isActive
                        ? "bg-[#7c3aed]/15 border border-[#7c3aed]/30 text-white"
                        : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                    }`}
                  >
                    {cmd.icon}
                    <span className="text-xs font-semibold flex-1 truncate">{cmd.label}</span>
                    <span className="text-[9px] font-mono text-slate-500 tracking-wide uppercase shrink-0 border border-white/5 px-1.5 py-0.5 rounded bg-black/30">
                      {cmd.shortcut}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 2. Discovered Semantic Clusters */}
          {filteredTopics.length > 0 && (
            <div className="space-y-1">
              <p className="px-3 text-[9px] font-mono uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-slate-500" /> Discovered Concept Clusters
              </p>
              {filteredTopics.map((page, idx) => {
                const globalIdx = filteredCommands.length + idx;
                const isActive = selectedIndex === globalIdx;
                return (
                  <button
                    key={page.topic_title}
                    onClick={() => handleSelectTopic(page)}
                    className={`flex flex-col gap-0.5 w-full px-3 py-2.5 rounded-xl text-left transition-all ${
                      isActive
                        ? "bg-[#7c3aed]/15 border border-[#7c3aed]/30 text-white"
                        : "border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                        {page.topic_title}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium pl-3.5 leading-normal truncate max-w-full block">
                      {page.summary}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {totalItems === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 select-none animate-pulse">
              <Terminal className="w-6 h-6 text-slate-600" />
              <p className="text-[10px] text-slate-600 font-mono">No matching commands or topic islands.</p>
            </div>
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="px-4 py-2 border-t border-white/5 bg-black/40 flex justify-between items-center text-[9px] font-mono text-slate-600 select-none">
          <div className="flex gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span>Acumen Command Center v3.5</span>
        </div>
      </div>
    </div>
  );
}
