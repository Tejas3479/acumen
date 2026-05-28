"use client";

import { Plus } from "lucide-react";
import IngestionEngine from "@/components/IngestionEngine";

interface WorkspaceIdleProps {
  handleUploadComplete: (sid: string, fname: string) => Promise<void> | void;
  handleStartSynthesis: (sid: string) => Promise<void> | void;
}

export default function WorkspaceIdle({
  handleUploadComplete,
  handleStartSynthesis,
}: WorkspaceIdleProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center gap-10">
      <div className="flex flex-col gap-4 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-700">
        <h2 className="text-3xl font-bold text-white tracking-tight">Welcome back</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          Your executable knowledge base is ready. What are we studying today? Upload a PDF or paste a URL to initialize a new Knowledge Graph.
        </p>
      </div>
      
      <div className="w-full max-w-md p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:bg-white/[0.05] transition-all group relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center mx-auto">
            <Plus className="w-6 h-6 text-[#a78bfa]" />
          </div>
          <IngestionEngine 
            mode="hero" 
            onUploadComplete={handleUploadComplete} 
            onStartSynthesis={handleStartSynthesis} 
          />
        </div>
      </div>
    </div>
  );
}
