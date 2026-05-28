"use client";

import { useState } from "react";
import { toast } from "sonner";
import { 
  FileDown, BookOpen, Clock, FileText, 
  Copy, Check, RefreshCw, Sparkles, HelpCircle
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

interface ArtifactStudioProps {
  sessionId: string;
}

type ArtifactType = "faq" | "study-guide" | "briefing" | "timeline";

export default function ArtifactStudio({ sessionId }: ArtifactStudioProps) {
  const [activeTab, setActiveTab] = useState<ArtifactType>("study-guide");
  const [contents, setContents] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchArtifact = async (type: ArtifactType) => {
    if (!sessionId) return;
    
    setGenerating(prev => ({ ...prev, [type]: true }));
    const toastId = toast.loading(`Assembling swarm to compile your premium ${type.replace("-", " ")}...`);

    try {
      const res = await fetch(`${API_BASE_URL}/generate-${type}/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const textKey = type === "study-guide" ? "study_guide" : type.replace("-", "_");
        const body = data[textKey] || data[type] || "";
        
        setContents(prev => ({ ...prev, [type]: body }));
        toast.success(`✨ Premium ${type.replace("-", " ")} compiled successfully!`, { id: toastId });
      } else {
        throw new Error("Failed to generate");
      }
    } catch (err) {
      toast.error(`Swarm failed to compile ${type}. Check Gemini configuration/keys.`, { id: toastId });
      console.error(err);
    } finally {
      setGenerating(prev => ({ ...prev, [type]: false }));
    }
  };

  const copyToClipboard = () => {
    const text = contents[activeTab];
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportZip = async () => {
    if (!sessionId) return;
    
    setExporting(true);
    const toastId = toast.loading("Assembling complete Research Pack (FAQs, Guides, Briefings, Timelines, Notes) into ZIP archive...");

    try {
      const res = await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/export`, {
        method: "POST"
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `acumen_research_pack_${sessionId.slice(0, 8)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success("✨ Intelligence export downloaded successfully!", { id: toastId });
      } else {
        throw new Error("Export failed");
      }
    } catch (err) {
      toast.error("Failed to compile Research Pack ZIP. Please try again.", { id: toastId });
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-4 shrink-0 gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#a78bfa]" />
            Artifact Studio
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">Compile raw document synthesis into premium, executive-ready assets</p>
        </div>

        <button
          disabled={exporting}
          onClick={handleExportZip}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-mono uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/25 hover:border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 transition-all rounded-xl cursor-pointer disabled:opacity-50 shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.05)] w-fit"
        >
          {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          Export Complete Pack
        </button>
      </div>

      {/* Tabs list */}
      <div className="flex gap-2.5 p-1 border border-white/5 bg-white/[0.01] rounded-2xl my-4 shrink-0 overflow-x-auto custom-scrollbar select-none">
        {[
          { id: "study-guide", label: "Study Guide", icon: <BookOpen className="w-3.5 h-3.5" /> },
          { id: "faq", label: "FAQ study pack", icon: <HelpCircle className="w-3.5 h-3.5" /> },
          { id: "briefing", label: "Briefing", icon: <FileText className="w-3.5 h-3.5" /> },
          { id: "timeline", label: "Chronology", icon: <Clock className="w-3.5 h-3.5" /> }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as ArtifactType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all border border-transparent whitespace-nowrap cursor-pointer ${
              activeTab === t.id
                ? "bg-[#7c3aed]/15 border-[#7c3aed]/30 text-white shadow-inner"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Render Panel */}
      <div className="flex-1 flex flex-col min-h-0 bg-black/20 border border-white/5 rounded-3xl overflow-hidden relative">
        {contents[activeTab] ? (
          <>
            {/* Action Bar */}
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/5 bg-white/[0.02] shrink-0">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                compiled md asset
              </span>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "COPIED" : "COPY TO CLIPBOARD"}
              </button>
            </div>

            {/* Markdown Display */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
              <div className="prose prose-invert prose-xs max-w-none text-slate-300 leading-relaxed font-sans space-y-4">
                {contents[activeTab].split("\n").map((line, idx) => {
                  if (line.startsWith("# ")) {
                    return <h1 key={idx} className="text-2xl font-bold text-white tracking-tight pt-4 border-b border-white/5 pb-2 mb-4">{line.slice(2)}</h1>;
                  }
                  if (line.startsWith("## ")) {
                    return <h2 key={idx} className="text-lg font-bold text-[#a78bfa] tracking-wide pt-4 mb-3">{line.slice(3)}</h2>;
                  }
                  if (line.startsWith("### ")) {
                    return <h3 key={idx} className="text-sm font-semibold text-slate-200 uppercase tracking-wider pt-2 mb-2">{line.slice(4)}</h3>;
                  }
                  if (line.startsWith("- ") || line.startsWith("* ")) {
                    return (
                      <div key={idx} className="flex gap-2 pl-2 text-sm text-slate-300">
                        <span className="text-[#a78bfa] mt-1 shrink-0">•</span>
                        <span>{line.slice(2)}</span>
                      </div>
                    );
                  }
                  if (line.match(/^\d+\.\s/)) {
                    return (
                      <div key={idx} className="flex gap-2 pl-2 text-sm text-slate-300">
                        <span className="text-[#a78bfa] font-mono shrink-0">{line.match(/^\d+/)?.[0]}.</span>
                        <span>{line.replace(/^\d+\.\s/, "")}</span>
                      </div>
                    );
                  }
                  if (!line.trim()) return <div key={idx} className="h-2" />;
                  
                  return <p key={idx} className="text-sm text-slate-400 leading-relaxed">{line}</p>;
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-center relative">
              <Sparkles className="w-6.5 h-6.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
            </div>
            <div className="max-w-xs space-y-2">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Asset Uncompiled</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Click below to launch an autonomous swarm coordinator. The agent will read your vector index and write a comprehensive, certified intelligence document.
              </p>
            </div>
            <button
              disabled={generating[activeTab]}
              onClick={() => fetchArtifact(activeTab)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#7c3aed] hover:bg-[#6d28d9] border border-[#8b5cf6]/40 hover:border-[#8b5cf6] text-white rounded-xl text-xs font-mono uppercase tracking-[0.15em] transition-all cursor-pointer disabled:opacity-50 shadow-[0_0_20px_rgba(124,58,237,0.2)]"
            >
              {generating[activeTab] ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  compiling...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Compile {activeTab.replace("-", " ")}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
