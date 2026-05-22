"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import Dropzone from "./Dropzone";
import { BASE as API_BASE_URL } from "@/lib/api";

interface AddSourceModalProps {
  sessionId: string;
  onSourceAdded: (sid: string, title?: string) => void;
}

export default function AddSourceModal({ sessionId, onSourceAdded }: AddSourceModalProps) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    if (!val) {
      setUrlError(null);
      return;
    }
    try {
      // Must be an absolute URL
      const parsed = new URL(val);
      if (!parsed.protocol.startsWith("http")) {
        setUrlError("URL protocol must be http or https.");
      } else {
        setUrlError(null);
      }
    } catch {
      setUrlError("Please enter a valid absolute URL (e.g. https://example.com)");
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput || urlError) return;

    try {
      setUrlLoading(true);
      new URL(urlInput); // Double check throw
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
      
      setOpen(false);
      setUrlInput("");
      setUrlError(null);
      onSourceAdded(sessionId);
      toast.success("Website source queued for background processing.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid URL");
    } finally {
      setUrlLoading(false);
    }
  };

  const handleUploadComplete = (sid: string, filename: string) => {
    setOpen(false);
    onSourceAdded(sid, filename);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Add Source
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-[#0a0a0f] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>Add to Knowledge Base</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-4">
          <Dropzone onUploadComplete={handleUploadComplete} disabled={urlLoading} sessionId={sessionId} compact />

          <div className="flex items-center gap-4 text-sm text-slate-500 px-2">
            <hr className="flex-1 border-white/10" /> 
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600">OR</span> 
            <hr className="flex-1 border-white/10" />
          </div>

          <form onSubmit={handleUrlSubmit} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Paste a website URL..." 
                className={`flex-1 bg-white/5 border rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none transition-all ${
                  urlError 
                    ? "border-red-500/50 focus:border-red-500" 
                    : "border-white/10 focus:border-[#7c3aed]/50"
                }`}
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                required
                disabled={urlLoading}
              />
              <button 
                type="submit"
                disabled={urlLoading || Boolean(urlError) || !urlInput.trim()}
                className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
              >
                {urlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Website"}
              </button>
            </div>
            {urlError && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-red-400 mt-1 px-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{urlError}</span>
              </div>
            )}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
