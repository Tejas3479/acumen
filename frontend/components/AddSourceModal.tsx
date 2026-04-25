"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import Dropzone from "./Dropzone";

interface AddSourceModalProps {
  sessionId: string;
  onSourceAdded: (sid: string, title?: string) => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export default function AddSourceModal({ sessionId, onSourceAdded }: AddSourceModalProps) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;
    try {
      setUrlLoading(true);
      new URL(urlInput); // throws if invalid
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
      onSourceAdded(sessionId);
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
        <button className="flex items-center gap-1.5 px-3 py-1.5 border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-xs font-medium transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Add Source
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-[#0a0a0f] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>Add to Knowledge Base</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-4">
          <Dropzone onUploadComplete={handleUploadComplete} disabled={urlLoading} sessionId={sessionId} />

          <div className="flex items-center gap-4 text-sm text-slate-500 px-2">
            <hr className="flex-1 border-white/10" /> 
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600">OR</span> 
            <hr className="flex-1 border-white/10" />
          </div>

          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <input 
              type="url" 
              placeholder="Paste a website URL..." 
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#7c3aed]/50 transition-colors"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              required
              disabled={urlLoading}
            />
            <button 
              type="submit"
              disabled={urlLoading}
              className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center min-w-[100px]"
            >
              {urlLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Website"}
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
