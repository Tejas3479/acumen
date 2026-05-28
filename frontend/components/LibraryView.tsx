/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { Plus, History as HistoryIcon, Library, Search, MessageSquare, Zap, GitBranch } from "lucide-react";
import IngestionEngine from "./IngestionEngine";
import type { Notebook } from "@/lib/types";

interface LibraryViewProps {
  notebooks: Notebook[];
  historySearchQuery: string;
  setHistorySearchQuery: (query: string) => void;
  handleUploadComplete: (sid: string, fname: string) => Promise<void>;
  handleStartSynthesis: (sid: string) => Promise<void>;
  handleSelectNotebook: (sid: string) => Promise<void>;
  handleNewNotebook: () => void;
  setView: (view: "workspace" | "library") => void;
}

export default function LibraryView({
  notebooks,
  historySearchQuery,
  setHistorySearchQuery,
  handleUploadComplete,
  handleStartSynthesis,
  handleSelectNotebook,
  handleNewNotebook,
  setView,
}: LibraryViewProps) {
  const filteredHistoryNotebooks = notebooks.filter((nb) =>
    nb.title.toLowerCase().includes(historySearchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--acumen-bg)]">
      <div className="max-w-6xl mx-auto flex flex-col px-8 py-12 gap-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="flex flex-col gap-2">
          <h2 className="text-4xl font-bold text-white tracking-tight">Knowledge Vault History</h2>
          <p className="text-slate-400 text-lg">Browse and manage your previously synthesized intelligence assets.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Card */}
          <div className="animate-in fade-in duration-500">
            <IngestionEngine 
              mode="hero" 
              onUploadComplete={handleUploadComplete} 
              onStartSynthesis={handleStartSynthesis} 
            />
          </div>

          {/* Quick Stats Card */}
          <div className="p-10 rounded-[2.5rem] bg-[#7c3aed]/5 border border-[#7c3aed]/20 backdrop-blur-2xl relative overflow-hidden">
             <div className="flex flex-col h-full justify-between gap-10">
               <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-white">Library Insights</h3>
                  <p className="text-slate-400">Total knowledge coverage across your sessions.</p>
               </div>
               <div className="grid grid-cols-2 gap-6">
                  <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5">
                     <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">Total Vaults</span>
                     <div className="text-4xl font-bold text-white mt-2">{notebooks.length}</div>
                  </div>
                  <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5">
                     <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">Processed</span>
                     <div className="text-4xl font-bold text-[#10b981] mt-2">{notebooks.filter(n => n.status === "completed").length}</div>
                  </div>
               </div>
               <div className="flex items-center gap-3 text-sm text-[#a78bfa] bg-[#7c3aed]/10 px-4 py-2.5 rounded-2xl w-fit border border-[#7c3aed]/20">
                  <Zap className="w-4 h-4 fill-[#a78bfa]" />
                  <span className="font-semibold tracking-wide">Gemini 2.5 Flash Powered</span>
               </div>
             </div>
          </div>
        </div>

        {/* Recent Activity List */}
        <div className="space-y-6 pb-20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.25em] flex items-center gap-2.5">
              <HistoryIcon className="w-4 h-4" /> Recent Knowledge Vaults
            </h3>
            {notebooks.length > 0 && (
              <div className="relative w-full sm:w-72 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-[#a78bfa] transition-colors" />
                <input
                  type="text"
                  placeholder="Search vault history..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 text-xs font-mono bg-white/[0.02] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#7c3aed]/50 focus:bg-white/[0.04] transition-all"
                />
                {historySearchQuery && (
                  <button
                    onClick={() => setHistorySearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-[10px] font-mono"
                  >
                    CLEAR
                  </button>
                )}
              </div>
            )}
          </div>
          {notebooks.length > 0 ? (
            (() => {
              if (filteredHistoryNotebooks.length === 0) {
                return (
                  <div className="p-16 border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 text-center">
                    <Search className="w-8 h-8 text-slate-600" />
                    <div className="text-slate-400 text-sm font-semibold">No vaults match &quot;{historySearchQuery}&quot;</div>
                    <button 
                      onClick={() => setHistorySearchQuery("")}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline font-mono"
                    >
                      Reset Search Query
                    </button>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                  {filteredHistoryNotebooks.map((nb) => (
                    <button 
                      key={nb.id}
                      onClick={() => { setView("workspace"); handleSelectNotebook(nb.id); }}
                      className="flex flex-col items-start p-6 rounded-3xl bg-white/[0.015] border border-white/5 hover:border-[#7c3aed]/40 hover:bg-white/[0.04] transition-all text-left group hover:translate-y-[-4px] duration-300 shadow-xl"
                    >
                      <div className="flex items-center gap-4 mb-4 w-full">
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[#7c3aed]/20 transition-colors">
                          {nb.sourceType === "url" ? <GitBranch className="w-5 h-5 text-blue-400" /> : <Library className="w-5 h-5 text-[#a78bfa]" />}
                        </div>
                        <div className="flex-1 truncate">
                          <div className="text-base font-bold text-white truncate group-hover:text-[#a78bfa] transition-colors">{nb.title}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">{new Date(nb.created_at || "").toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 w-full pt-4 border-t border-white/5">
                         <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                           <MessageSquare className="w-3 h-3" />
                           <span>{nb.history?.length || 0}</span>
                         </div>
                         <div className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${nb.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${nb.status === "completed" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
                           <span className="text-[10px] font-bold uppercase tracking-wider">{nb.status}</span>
                         </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()
          ) : (
            <div className="p-20 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center gap-4 text-center">
               <Library className="w-12 h-12 text-slate-700" />
               <div className="text-slate-500">No notebooks yet. Upload your first source to begin.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
