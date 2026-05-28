"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { 
  FileText, Globe, Trash2, Clock, CheckCircle2, 
  AlertCircle, RefreshCw, Info, Inbox
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

interface Source {
  source_id: string;
  title: string;
  source_type: "pdf" | "url" | "docx" | "txt" | "md" | "html";
  status: "processing" | "completed" | "error";
  created_at: string;
}

interface SourcesManagerProps {
  sessionId: string;
  onSourceDeleted: () => void;
}

export default function SourcesManager({ sessionId, onSourceDeleted }: SourcesManagerProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch (err) {
      console.error("Failed to load notebook sources:", err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const hasProcessingSource = sources.some(s => s.status === "processing");

  useEffect(() => {
    fetchSources();
    
    // Poll sources while any are processing
    const interval = setInterval(() => {
      if (hasProcessingSource) {
        fetchSources();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [sessionId, fetchSources, hasProcessingSource]);

  const handleDelete = async (sourceId: string, title: string) => {
    if (!sessionId) return;
    
    const confirmDelete = window.confirm(`Are you sure you want to remove the source "${title}"? This will dynamically re-synthesize your entire knowledge base.`);
    if (!confirmDelete) return;

    setDeletingId(sourceId);
    const toastId = toast.loading(`Removing "${title}" and re-clustering graph...`);

    try {
      const res = await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/sources/${sourceId}`, {
        method: "DELETE"
      });

      if (res.ok) {
        toast.success(`Source "${title}" deleted successfully. Swarm re-synthesis triggered.`, { id: toastId });
        fetchSources();
        onSourceDeleted();
      } else {
        throw new Error("Failed to delete source");
      }
    } catch (err) {
      toast.error(`Failed to delete source "${title}". Please try again.`, { id: toastId });
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "url":
        return <Globe className="w-4 h-4 text-sky-400" />;
      default:
        return <FileText className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar space-y-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Source Management</h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">List, verify, and clean individual intelligent layers</p>
        </div>
        <button 
          onClick={fetchSources} 
          disabled={loading}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && sources.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
          <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
          <span className="text-xs text-slate-500 font-mono">Retrieving intelligent document list...</span>
        </div>
      ) : sources.length === 0 ? (
        <div className="flex-1 border border-dashed border-white/5 rounded-3xl p-16 flex flex-col items-center justify-center text-center gap-4">
          <Inbox className="w-12 h-12 text-slate-700" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">No separate sources</h3>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              This notebook was initialized with a single upload. Appending documents will register individual sources here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <div 
              key={s.source_id} 
              className="flex items-center justify-between p-4 rounded-2xl border border-white/5 bg-white/[0.015] hover:bg-white/[0.03] transition-all group"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  {getIcon(s.source_type)}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-medium text-slate-200 truncate pr-2" title={s.title}>
                    {s.title}
                  </h4>
                  <div className="flex items-center gap-2.5 mt-1 font-mono text-[9px] text-slate-500">
                    <span className="uppercase">{s.source_type}</span>
                    <span>•</span>
                    <span>{new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Status Pills */}
                {s.status === "processing" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20 animate-pulse">
                    <Clock className="w-3 h-3" />
                    <span>parsing</span>
                  </span>
                )}
                {s.status === "completed" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-lg border border-emerald-400/20">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>ready</span>
                  </span>
                )}
                {s.status === "error" && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-lg border border-rose-400/20">
                    <AlertCircle className="w-3 h-3" />
                    <span>failed</span>
                  </span>
                )}

                {/* Delete Button */}
                <button
                  disabled={deletingId === s.source_id}
                  onClick={() => handleDelete(s.source_id, s.title)}
                  className="p-2 rounded-xl bg-white/5 border border-transparent hover:border-red-500/20 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer disabled:opacity-50 shrink-0 md:opacity-0 md:group-hover:opacity-100 duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Info Banner */}
          <div className="flex gap-3 p-4 rounded-2xl border border-indigo-500/15 bg-indigo-500/5 text-xs leading-relaxed text-indigo-300">
            <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <p>
              Removing a source instantly evicts all derived embeddings from the vector database. Remaining documents are automatically re-clustered, and your knowledge base graphs will re-synthesize dynamically under 15 seconds.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
