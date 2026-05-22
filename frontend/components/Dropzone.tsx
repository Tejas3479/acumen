"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Loader2, FileUp, AlertTriangle } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { BASE as API_BASE_URL } from "@/lib/api";

interface DropzoneProps {
  onUploadComplete: (sessionId: string, filename: string) => void;
  disabled?: boolean;
  sessionId?: string | null;
  compact?: boolean;
}

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".html", ".htm"];

export default function Dropzone({ onUploadComplete, disabled, sessionId, compact }: DropzoneProps) {
  const { getToken } = useAuth();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const handleFile = async (file: File) => {
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError(`Supported formats: PDF, DOCX, TXT, MD, HTML.`);
      return;
    }
    setError(null);
    setLoading(true);
    setProgress(0);

    // Start progress simulation (exponential deceleration)
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        const step = (100 - prev) * 0.15;
        return Math.min(prev + step, 95);
      });
    }, 150);

    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      
      const url = sessionId 
        ? `${API_BASE_URL}/upload?session_id=${sessionId}`
        : `${API_BASE_URL}/upload`;
        
      const uploadRes = await fetch(url, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: form,
      });

      if (!uploadRes.ok) {
        const d = await uploadRes.json();
        throw new Error(d.detail ?? "Upload failed");
      }

      const uploadData = await uploadRes.json();
      const newSessionId: string = uploadData.session_id;

      // Finish progress animation
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setProgress(100);
      
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
        onUploadComplete(newSessionId, file.name);
      }, 300);

    } catch (e: unknown) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setProgress(0);
      setLoading(false);
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || loading) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (compact) {
    return (
      <div
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled && !loading) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-center justify-between gap-2 px-3 h-10 rounded-xl cursor-pointer transition-all border border-dashed
          ${dragging ? "bg-indigo-500/20 border-indigo-500/50" : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"}
          ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
          ) : error ? (
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          ) : (
            <FileUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          )}
          <span className="text-[11px] font-medium text-slate-300 truncate">
            {loading 
              ? `Ingesting... (${Math.round(progress)}%)` 
              : error 
                ? "Failed. Click to retry." 
                : "Add Source Document"
            }
          </span>
        </div>
        {loading && (
          <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden shrink-0">
            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => !disabled && !loading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled && !loading) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`dropzone flex flex-col items-center justify-center gap-3 py-8 px-6 select-none h-44 cursor-pointer transition-all duration-300
        ${dragging ? "active scale-[1.01] border-indigo-500/50 bg-indigo-500/5" : ""}
        ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {loading ? (
        <>
          <Loader2 className="w-10 h-10 text-[#7c3aed] animate-spin" />
          <p className="text-sm font-medium text-slate-300">
            Extracting & synthesizing ({Math.round(progress)}%)
          </p>
          <div className="w-48 h-1.5 rounded-full bg-white/5 overflow-hidden mt-1 relative">
            <div 
              className="h-full bg-gradient-to-r from-[#7c3aed] to-[#38bdf8] transition-all duration-300" 
              style={{ width: `${progress}%` }} 
            />
          </div>
        </>
      ) : (
        <>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
            error 
              ? "bg-red-500/10 border border-red-500/30" 
              : "bg-[#7c3aed]/10 border border-[#7c3aed]/30 hover:scale-105"
          }`}>
            {error ? (
              <AlertTriangle className="w-7 h-7 text-red-400" />
            ) : (
              <Upload className="w-7 h-7 text-[#7c3aed]" />
            )}
          </div>
          <div className="text-center flex flex-col items-center">
            <p className={`text-sm font-medium mb-1 px-4 text-center ${error ? "text-red-400 font-mono text-xs" : "text-white"}`}>
              {error ?? "Drop your files here"}
            </p>
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
              {error ? "Click here to retry" : "PDF, DOCX, TXT, MD, or HTML"}
            </p>
            {error && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setError(null);
                  inputRef.current?.click();
                }}
                className="mt-3 px-4 py-1.5 bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600 text-white font-mono text-[10px] rounded-xl tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(79,70,229,0.1)]"
              >
                Retry Upload
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
