"use client";

import { useState, useEffect, useRef } from "react";
import {
  Brain, GitBranch, LayoutPanelLeft,
  MessageSquare, Loader2, AlertTriangle,
  Plus, ChevronDown, Globe, BookText, Library
} from "lucide-react";

import { UserButton } from "@clerk/nextjs";
import AddSourceModal from "@/components/AddSourceModal";
import WorkspaceHud from "@/components/WorkspaceHud";
import type { Notebook, WikiPage } from "@/lib/types";
import type { Node } from "reactflow";

type AppState = "idle" | "synthesizing" | "ready" | "error";
type ActivePanel = "graph" | "chat";

interface WorkspaceHeaderProps {
  view: "workspace" | "library";
  notebooks: Notebook[];
  sessionId: string | null;
  filename: string;
  handleNewNotebook: () => void;
  handleSelectNotebook: (id: string) => void;
  setView: (view: "workspace" | "library") => void;
  appState: AppState;
  graphNodes: Node[];
  wikiPages: WikiPage[];
  activePanel: ActivePanel;
  setActivePanel: React.Dispatch<React.SetStateAction<ActivePanel>>;
  handleSourceAdded: (sid: string) => void;
}

export default function WorkspaceHeader({
  view,
  notebooks,
  sessionId,
  filename,
  handleNewNotebook,
  handleSelectNotebook,
  setView,
  appState,
  graphNodes,
  wikiPages,
  activePanel,
  setActivePanel,
  handleSourceAdded,
}: WorkspaceHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as HTMLElement)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <header className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/8 shrink-0" style={{ background: "rgba(10, 10, 15, 0.45)", backdropFilter: "blur(20px)" }}>
      <button 
        onClick={handleNewNotebook}
        className="flex items-center gap-2.5 shrink-0 md:ml-0 ml-10 group transition-all active:scale-95 bg-transparent border-0 text-left cursor-pointer p-0"
      >
        <div className="w-8 h-8 rounded-xl bg-[#7c3aed]/20 border border-[#7c3aed]/40 flex items-center justify-center glow-purple-sm group-hover:bg-[#7c3aed]/30 group-hover:border-[#7c3aed]/60 transition-all">
          <Brain className="w-4 h-4 text-[#a78bfa] group-hover:scale-110 transition-transform" />
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-base font-bold gradient-text tracking-tight">Acumen</span>
          <span className="text-[10px] text-slate-600 font-mono hidden lg:block">/ workspace dashboard</span>
        </div>
      </button>

      {/* Premium Sliding Navbar (Top-level Navigation) */}
      <div className="flex items-center gap-1.5 p-1 bg-white/[0.02] border border-white/5 rounded-2xl ml-4 select-none">
        <button
          onClick={() => setView("workspace")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-mono uppercase tracking-wider transition-all duration-300 cursor-pointer border ${
            view === "workspace"
              ? "bg-white/10 text-white border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              : "text-slate-500 hover:text-slate-300 border-transparent bg-transparent"
          }`}
        >
          <LayoutPanelLeft className="w-3.5 h-3.5 text-[#a78bfa]" />
          Workspace
        </button>
        <button
          onClick={() => setView("library")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[11px] font-mono uppercase tracking-wider transition-all duration-300 cursor-pointer border ${
            view === "library"
              ? "bg-white/10 text-white border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              : "text-slate-500 hover:text-slate-300 border-transparent bg-transparent"
          }`}
        >
          <Library className="w-3.5 h-3.5 text-blue-400" />
          Vault History
        </button>
      </div>

      {notebooks.length >= 0 ? (
        <div className="ml-2 relative flex items-center gap-2" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-200 text-left cursor-pointer max-w-[180px] md:max-w-[260px] shadow-sm select-none"
          >
            <GitBranch className="w-3.5 h-3.5 text-[#a78bfa] shrink-0" />
            <span className="text-xs text-slate-300 truncate font-semibold flex-1">
              {filename || "Select Knowledge Base..."}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 rounded-2xl bg-[#0c0d14]/95 backdrop-blur-2xl border border-white/10 p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-3 py-2 text-[10px] font-mono text-slate-500 uppercase tracking-widest border-b border-white/5 mb-1.5 flex justify-between items-center select-none">
                <span>Your Vaults</span>
                <span>{notebooks.length} total</span>
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                {notebooks.map((nb) => {
                  const isActive = nb.id === sessionId;
                  return (
                    <button
                      key={nb.id}
                      onClick={() => {
                        setView("workspace");
                        handleSelectNotebook(nb.id);
                        setDropdownOpen(false);
                      }}
                      className={`flex items-center gap-3 w-full p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                        isActive
                          ? "bg-white/10 text-white border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                          : "hover:bg-white/5 text-slate-400 hover:text-white border border-transparent bg-transparent"
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg ${isActive ? "bg-[#7c3aed]/20 border border-[#7c3aed]/30" : "bg-white/5 border border-white/5"}`}>
                        {nb.sourceType === "url" ? (
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                        ) : (
                          <BookText className="w-3.5 h-3.5 text-[#a78bfa]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{nb.title}</div>
                        <div className="text-[9px] font-mono text-slate-500 mt-0.5">
                          {nb.created_at ? new Date(nb.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'N/A'}
                        </div>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        nb.status === "completed" 
                          ? "bg-emerald-500" 
                          : nb.status === "error" 
                            ? "bg-red-500" 
                            : "bg-amber-500 animate-pulse"
                      }`} />
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-white/5 mt-1.5 pt-1.5">
                <button
                  onClick={() => {
                    handleNewNotebook();
                    setDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 w-full p-2 rounded-xl text-xs font-mono uppercase tracking-[0.1em] text-indigo-400 hover:text-indigo-300 hover:bg-[#7c3aed]/10 transition-all justify-center cursor-pointer bg-transparent border-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Knowledge Base
                </button>
              </div>
            </div>
          )}
        </div>
      ) : filename && (
        <div className="ml-2 hidden sm:flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10">
            <GitBranch className="w-3 h-3 text-[#7c3aed]" />
            <span className="text-xs text-slate-300 truncate max-w-[140px] md:max-w-[200px]">{filename}</span>
          </div>
        </div>
      )}
      
      {sessionId && <AddSourceModal sessionId={sessionId} onSourceAdded={handleSourceAdded} />}

      <div className="flex-grow flex justify-center hidden md:flex">
        {appState === "ready" && (
          <WorkspaceHud wikiPages={wikiPages} filename={filename} notebooksCount={notebooks.length} />
        )}
      </div>

      {appState === "ready" && (
        <div className="hidden sm:flex items-center gap-1.5">
          <div className="pulse-dot" />
          <span className="text-xs text-[#10b981]">{graphNodes.length} topics</span>
        </div>
      )}
      {appState === "synthesizing" && (
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#7c3aed]/10 border border-[#7c3aed]/30">
          <Loader2 className="w-3 h-3 text-[#a78bfa] animate-spin" />
          <span className="text-xs text-[#a78bfa]">Synthesizing…</span>
        </div>
      )}
      {appState === "error" && (
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span className="text-xs text-red-400">Error</span>
        </div>
      )}

      {appState === "ready" && (
        <button 
          onClick={() => setActivePanel(activePanel === "graph" ? "chat" : "graph")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 md:hidden border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa] hover:bg-[#7c3aed]/20 cursor-pointer"
        >
          {activePanel === "graph" ? (
            <><MessageSquare className="w-3.5 h-3.5" /> Chat</>
          ) : (
            <><LayoutPanelLeft className="w-3.5 h-3.5" /> Graph</>
          )}
        </button>
      )}

      <UserButton
        appearance={{
          elements: {
            avatarBox: "w-8 h-8 ring-2 ring-[#7c3aed]/40 hover:ring-[#7c3aed] transition-all",
          },
        }}
      />
    </header>
  );
}
