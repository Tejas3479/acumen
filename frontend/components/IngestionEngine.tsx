"use client";

import { useState } from "react";
import { Search, Loader2, Globe, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";
import Dropzone from "./Dropzone";

interface IngestionEngineProps {
  mode: "hero" | "compact";
  sessionId?: string | null;
  onUploadComplete: (sid: string, title: string) => void;
  onStartSynthesis: (sid: string) => void;
}

import { BASE as API_BASE_URL } from "@/lib/api";

export default function IngestionEngine({ mode, sessionId, onUploadComplete, onStartSynthesis }: IngestionEngineProps) {
  const { getToken } = useAuth();
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;
    try {
      setUrlLoading(true);
      const token = await getToken();
      
      const res = await fetch(`${API_BASE_URL}/upload-url`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: urlInput, session_id: sessionId })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "URL ingestion failed");
      }
      
      const data = await res.json();
      const sid = data.session_id;
      const domain = new URL(urlInput).hostname;
      
      onUploadComplete(sid, domain);
      onStartSynthesis(sid);
      setUrlInput("");
      toast.success(`URL '${domain}' added to knowledge base`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Invalid URL");
    } finally {
      setUrlLoading(false);
    }
  };

  if (mode === "compact") {
    return (
      <div className="flex items-center gap-3 p-1.5 bg-[#0a0a0b]/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex items-center gap-2 px-3 h-10 min-w-[240px] bg-white/5 rounded-xl border border-white/5 focus-within:border-indigo-500/50 transition-colors group">
          <Search className="w-3.5 h-3.5 text-slate-500 group-focus-within:text-indigo-400" />
          <form onSubmit={handleUrlSubmit} className="flex-1">
            <input 
              type="url" 
              placeholder="Add another URL..." 
              className="w-full bg-transparent border-none p-0 text-xs text-white placeholder:text-slate-600 focus:ring-0"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={urlLoading}
            />
          </form>
          {urlLoading && <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />}
        </div>
        
        <div className="h-6 w-[1px] bg-white/10" />
        
        <Dropzone 
          sessionId={sessionId} 
          onUploadComplete={onUploadComplete} 
          compact={true} 
        />
      </div>
    );
  }

  // Hero Mode
  return (
    <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-700">
      <div className="text-center space-y-2 mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono uppercase tracking-widest text-indigo-400 mb-2">
          <Sparkles className="w-3 h-3" />
          Agentic Ingestion Engine
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Expand Your Knowledge</h1>
        <p className="text-sm text-slate-400">Acumen clusters PDFs and URLs with KMeans ML to build your graph.</p>
      </div>
      
      <div className="p-1 rounded-[22px] bg-gradient-to-b from-white/10 to-transparent shadow-2xl">
        <div className="bg-[#0f0f13] rounded-[21px] p-6 space-y-6">
          <Dropzone onUploadComplete={onUploadComplete} sessionId={sessionId} />

          <div className="relative flex items-center gap-4 py-2">
            <div className="flex-1 h-[1px] bg-white/5" />
            <span className="text-[10px] font-bold text-slate-600 tracking-tighter uppercase">OR</span>
            <div className="flex-1 h-[1px] bg-white/5" />
          </div>

          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <div className="flex-1 relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Globe className="w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
              </div>
              <input 
                type="url" 
                placeholder="Paste a website URL..." 
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                required
                disabled={urlLoading}
              />
            </div>
            <button 
              type="submit"
              disabled={urlLoading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/20 active:scale-95 disabled:opacity-50"
            >
              {urlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Synthesize"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
