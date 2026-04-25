"use client";

import { useState, useRef } from "react";
import { Upload, FileText, Loader2, FileUp } from "lucide-react";

import { useAuth } from "@clerk/nextjs";

interface DropzoneProps {
  onUploadComplete: (sessionId: string, filename: string) => void;
  disabled?: boolean;
  sessionId?: string | null;
  compact?: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export default function Dropzone({ onUploadComplete, disabled, sessionId, compact }: DropzoneProps) {
  const { getToken } = useAuth();
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    setError(null);
    setLoading(true);
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

      onUploadComplete(newSessionId, file.name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (compact) {
    return (
      <div
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-center gap-2 px-3 h-10 rounded-xl cursor-pointer transition-all border border-dashed
          ${dragging ? "bg-indigo-500/20 border-indigo-500/50" : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"}
          ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
        ) : (
          <FileUp className="w-3.5 h-3.5 text-indigo-400" />
        )}
        <span className="text-[11px] font-medium text-slate-300">
          {loading ? "Uploading..." : "Add PDF"}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={() => !disabled && !loading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`dropzone flex flex-col items-center justify-center gap-3 py-8 px-6 select-none h-40
        ${dragging ? "active" : ""}
        ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {loading ? (
        <>
          <Loader2 className="w-10 h-10 text-[#7c3aed] animate-spin" />
          <p className="text-sm text-slate-400">Extracting & synthesizing knowledge…</p>
          <div className="w-48 h-1.5 rounded-full bg-white/5 overflow-hidden mt-1">
            <div className="h-full bg-gradient-to-r from-[#7c3aed] to-[#38bdf8] animate-[shimmer_1.4s_infinite] w-full" />
          </div>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#7c3aed]/10 border border-[#7c3aed]/30">
            {error ? (
              <FileUp className="w-7 h-7 text-red-400" />
            ) : (
              <Upload className="w-7 h-7 text-[#7c3aed]" />
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white mb-1">
              {error ?? "Drop your PDF here"}
            </p>
            <p className="text-xs text-slate-500">
              {error ? "Try again" : "or click to browse · PDF only"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
