"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Square, Loader2, Headphones } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

interface ScriptLine {
  host: "A" | "B";
  text: string;
}

export default function PodcastPlayer({ sessionId }: { sessionId: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [script, setScript] = useState<ScriptLine[]>([]);
  const [loadingScript, setLoadingScript] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { getToken } = useAuth();

  // Load script when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setScript([]);
      return;
    }

    const fetchScript = async () => {
      if (sessionId === "demo-session") {
        setScript([
          { host: "A", text: "Welcome to Acumen. I'm your host, A." },
          { host: "B", text: "And I'm B. Today we're looking at your document synthesis." },
          { host: "A", text: "It seems we've mapped your knowledge into a visual graph. Ready to dive in?" }
        ]);
        return;
      }

      try {
        setLoadingScript(true);
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/generate-podcast/${sessionId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setScript(data.script || []);
        } else {
          // If the backend fails (e.g. session not found), show a generic placeholder
          setScript([{ host: "A", text: "Select a notebook to generate a deep-dive podcast overview." }]);
        }
      } catch (e) {
        console.error("Failed to load podcast script", e);
        // On network error (backend down), show informative state instead of crashing
        setScript([{ host: "A", text: "Backend unreachable. Please ensure the server is running." }]);
      } finally {
        setLoadingScript(false);
      }
    };

    fetchScript();
  }, [sessionId, getToken]);

  // Cleanup on unmount (e.g. switching notebooks)
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlay = async () => {
    if (!sessionId) {
      toast.error("Upload a document first to generate a podcast.");
      return;
    }
    
    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlaying(false);
      return;
    }

    try {
      setIsGenerating(true);
      const token = await getToken();

      const res = await fetch(`${API_BASE_URL}/generate-audio/${sessionId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail ?? `Failed to generate audio: ${res.status} ${res.statusText}`);
      }
      
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => setPlaying(false);
      audio.onerror = (e) => {
        console.error("Audio playback error", e);
        setPlaying(false);
        toast.error("Failed to play the podcast audio.");
      };

      setIsGenerating(false);
      setPlaying(true);
      
      await audio.play();
      
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Failed to start podcast.";
      toast.error(msg);
      setIsGenerating(false);
      setPlaying(false);
    }
  };

  if (!sessionId) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header with Play Button */}
      <div className="flex items-center gap-3 py-1 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
          <Headphones className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white/90 truncate">Audio Overview</div>
          <div className="text-xs text-slate-400 truncate">Deep Dive Podcast</div>
        </div>
        
        {playing && (
          <div className="flex items-center gap-[2px] h-4 mx-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full"
                style={{
                  background: "#6366f1",
                  height: `${((i * 7) % 12) + 4}px`,
                  animation: `wave-bar 0.${6 + (i % 4)}s ease-in-out ${i * 0.05}s infinite alternate`,
                  transition: "height 0.2s ease",
                }}
              />
            ))}
          </div>
        )}

        <button
          onClick={handlePlay}
          disabled={isGenerating}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-white/5 hover:bg-white/10 text-white border border-white/10 shrink-0"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Synthesizing Audio...</span>
            </>
          ) : playing ? (
            <>
              <Square className="w-4 h-4 text-rose-400 fill-current" />
              <span>Stop</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 text-indigo-400 fill-current" />
              <span>Play</span>
            </>
          )}
        </button>
      </div>

      {/* Script Section */}
      <div className="space-y-3 mt-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
        {loadingScript ? (
          <div className="flex flex-col gap-2">
            <div className="h-4 w-3/4 bg-white/5 animate-pulse rounded" />
            <div className="h-4 w-1/2 bg-white/5 animate-pulse rounded" />
          </div>
        ) : script.length > 0 ? (
          script.map((line, i) => (
            <div key={i} className={`flex flex-col gap-1 ${line.host === "A" ? "items-start" : "items-end"}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono uppercase tracking-widest ${line.host === "A" ? "text-indigo-400" : "text-emerald-400"}`}>
                  Host {line.host}
                </span>
              </div>
              <p className={`text-xs p-3 rounded-2xl max-w-[85%] leading-relaxed ${
                line.host === "A" 
                  ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-50" 
                  : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-50"
              }`}>
                {line.text}
              </p>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-xs text-slate-500 italic">
            Synthesizing podcast overview...
          </div>
        )}
      </div>
    </div>
  );
}
