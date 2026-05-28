/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Square, Loader2, Headphones, Download, 
  Volume2, FastForward, Check, Copy, User, 
  VolumeX, Sparkles, Mic, LogOut
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@clerk/nextjs";

import { BASE as API_BASE_URL } from "@/lib/api";

interface ScriptLine {
  host: "A" | "B" | "C";
  text: string;
  audio?: string | null;
}

export default function PodcastPlayer({ sessionId }: { sessionId: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [script, setScript] = useState<ScriptLine[]>([]);
  const [loadingScript, setLoadingScript] = useState(false);
  
  // High fidelity studio audio states
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1); // avoid 0 division
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [copiedText, setCopiedText] = useState<number | null>(null);

  // Simulated Live Join States
  const [isJoined, setIsJoined] = useState(false);
  const [deskInput, setDeskInput] = useState("");
  const [liveHistory, setLiveHistory] = useState<ScriptLine[]>([]);
  const [isDeskReplying, setIsDeskReplying] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scriptContainerRef = useRef<HTMLDivElement>(null);
  const liveDeskEndRef = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();

  // Load script when sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setScript([]);
      setAudioBlobUrl(null);
      return;
    }

    const fetchScript = async () => {
      if (sessionId === "demo-session") {
        setScript([
          { host: "A", text: "Welcome to Acumen. I'm your host, A, your dynamic semantic engine." },
          { host: "B", text: "And I'm B. Today we are doing a deep dive into the concept clusters mapped on your canvas." },
          { host: "A", text: "We have fit a mathematical KMeans model to cluster your uploaded pages into discrete islands." },
          { host: "B", text: "That is fascinating. The parallel synthesis swarms then summarize these topic islands in seconds." },
          { host: "A", text: "Let's explore the knowledge nodes together. Ask us anything in the Action Agent chat!" }
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
          setScript([
            { host: "A", text: "Hello! Upload your document so that Host B and I can synthesize a detailed overview." },
            { host: "B", text: "Exactly. Once the clustering completes, we will present key takeaways right here!" }
          ]);
        }
      } catch (e) {
        console.error("Failed to load podcast script", e);
        setScript([
          { host: "A", text: "Offline Mode Active. Unable to fetch a custom studio script from the server." },
          { host: "B", text: "Make sure your backend API is online at port 8000 and the DB is seeded." }
        ]);
      } finally {
        setLoadingScript(false);
      }
    };

    fetchScript();
  }, [sessionId, getToken]);

  // Clean up and stop audio when sessionId changes or component unmounts
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlaying(false);
      setCurrentTime(0);
      setAudioBlobUrl(null);
    };
  }, [sessionId]);

  // Volume control sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Seed live history with initial conversation snippets when user joins
  useEffect(() => {
    if (isJoined && liveHistory.length === 0 && script.length > 0) {
      setLiveHistory(script.slice(0, 3));
    }
  }, [isJoined, script, liveHistory]);

  // Auto scroll live desk terminal
  useEffect(() => {
    if (isJoined && liveDeskEndRef.current) {
      liveDeskEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [liveHistory, isJoined, isDeskReplying]);

  const handlePlay = async () => {
    if (!sessionId) {
      toast.error("Upload a document first to generate a podcast.");
      return;
    }
    
    // Play/Pause toggler
    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlaying(false);
      return;
    }

    // If audio is already loaded and paused, resume playback
    if (audioRef.current && audioRef.current.src) {
      setPlaying(true);
      audioRef.current.play();
      return;
    }

    // Otherwise, generate audio from scratch
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
        throw new Error(errData.detail ?? `Failed to generate audio: ${res.status}`);
      }
      
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      setAudioBlobUrl(audioUrl);
      
      const audio = new Audio(audioUrl);
      audio.playbackRate = playbackRate;
      audio.volume = isMuted ? 0 : volume;
      audioRef.current = audio;
      
      audio.onloadedmetadata = () => {
        if (audio.duration) setDuration(audio.duration);
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setPlaying(false);
        setCurrentTime(0);
      };

      audio.onerror = (e) => {
        console.error("Audio playback error", e);
        setPlaying(false);
        toast.error("Failed to play the podcast audio. Try playing again.");
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

  // Drag scrubber to seek
  const handleSeek = (values: number[]) => {
    const seekTime = values[0];
    setCurrentTime(seekTime);
    if (audioRef.current) {
      audioRef.current.currentTime = seekTime;
    }
  };

  // Speed adjustments
  const handleSpeedChange = () => {
    const rates = [1.0, 1.25, 1.5, 2.0, 0.75];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
    toast.success(`Speed scaled to ${nextRate}x`);
  };

  // Live interruption submission
  const handleSendDeskInterruption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deskInput.trim() || !sessionId || isDeskReplying) return;

    const userMsg = deskInput.trim();
    setDeskInput("");
    setIsDeskReplying(true);

    const nextHistory: ScriptLine[] = [
      ...liveHistory,
      { host: "C", text: userMsg }
    ];
    setLiveHistory(nextHistory);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/podcast/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMsg,
          history: nextHistory.slice(-6).map((h) => ({ host: h.host, text: h.text })),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to receive response from desk co-hosts.");
      }

      const data = await res.json();
      const responses: ScriptLine[] = data.response || [];

      // Append responses and play synthesized voices sequentially in memory
      for (const line of responses) {
        // Optimistically show text bubble immediately
        setLiveHistory((prev) => [...prev, { host: line.host, text: line.text }]);
        
        if (line.audio) {
          // Play the dynamically synthesized WAV voice clip in memory
          await new Promise<void>((resolve) => {
            const audio = new Audio(line.audio as string);
            audio.onended = () => resolve();
            audio.onerror = () => resolve(); // continue sequentially if playback fails
            audio.play();
          });
        } else {
          // Fallback delay to match speech rate if audio is not synthesized
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    } catch (err) {
      toast.error("Failed to interrupt co-hosts. Try again.");
    } finally {
      setIsDeskReplying(false);
    }
  };

  // Microphone interruption capturing (Speech-to-Text)
  const handleDeskMicrophone = () => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Browser speech recognition is not supported. Use Chrome or Safari.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => {
      setIsListening(true);
      toast.info("🎙️ Microphone active. Speak to co-hosts...", { duration: 2500 });
    };

    rec.onerror = () => {
      setIsListening(false);
      toast.error("Microphone capture failed. Use standard input bar.");
    };

    rec.onend = () => {
      setIsListening(false);
    };

    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setDeskInput(transcript);
      toast.success("Voice transcribed successfully!");
    };

    rec.start();
  };

  // Time formatter helper
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Estimate the currently active script index based on time percentage
  const activeLineIndex = (duration > 0 && script.length > 0)
    ? Math.min(Math.floor((currentTime / duration) * script.length), script.length - 1)
    : -1;

  // Auto-scroll transcript container to keep the active line in viewport
  useEffect(() => {
    if (activeLineIndex !== -1 && scriptContainerRef.current) {
      const activeEl = document.getElementById(`podcast-bubble-${activeLineIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "nearest"
        });
      }
    }
  }, [activeLineIndex]);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedText(idx);
    setTimeout(() => setCopiedText(null), 2000);
    toast.success("Dialogue copied to clipboard");
  };

  if (!sessionId) return null;

  const currentSpeaker = activeLineIndex !== -1 ? script[activeLineIndex]?.host : null;

  return (
    <div className="flex flex-col gap-5 p-5 rounded-[2.5rem] bg-gradient-to-b from-[#0f0f15]/90 to-[#07070b]/95 border border-white/8 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] transition-all duration-300">
      
      {/* 1. Header & Studio Console UI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5 relative">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center glow-purple-sm">
            <Headphones className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight">Audio Studio Overview</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                Active Desk
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">KMeans Topic Summarizer Swarm</p>
          </div>
        </div>

        {/* Audio Visualizer Waves (Pulsing Canvas-Free Bars) */}
        <div className="flex items-center gap-[3px] h-6 px-4 py-1.5 rounded-full bg-white/[0.02] border border-white/5 w-fit">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className={`w-[2px] rounded-full bg-gradient-to-t from-indigo-500 to-cyan-400 transition-all duration-300`}
              style={{
                height: playing ? "16px" : "3px",
                animation: playing 
                  ? `wave-bar 0.${5 + (i % 5)}s ease-in-out ${i * 0.04}s infinite alternate` 
                  : "none",
              }}
            />
          ))}
        </div>
      </div>

      {/* 2. Interactive Host Profiles & Speakers Visualizer */}
      <div className="grid grid-cols-2 gap-4">
        {/* Host A Speaker Card */}
        <div className={`p-3.5 rounded-2xl border transition-all duration-500 flex items-center gap-3 relative overflow-hidden ${
          !isJoined && playing && currentSpeaker === "A"
            ? "bg-[#7c3aed]/10 border-[#7c3aed]/40 shadow-[0_0_20px_rgba(124,58,237,0.15)] scale-[1.01]" 
            : "bg-white/[0.02] border-white/5 opacity-60"
        }`}>
          {!isJoined && playing && currentSpeaker === "A" && (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.15),transparent)] pointer-events-none" />
          )}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300 ${
            !isJoined && playing && currentSpeaker === "A" 
              ? "bg-[#7c3aed] border-[#a78bfa] scale-105" 
              : "bg-white/5 border-white/10"
          }`}>
            <User className={`w-4 h-4 ${!isJoined && playing && currentSpeaker === "A" ? "text-white" : "text-slate-400"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-mono font-bold tracking-widest text-[#a78bfa] uppercase">Speaker Host A</span>
            <p className="text-xs font-bold text-white truncate">AI Concept Explainer</p>
          </div>
          {!isJoined && playing && currentSpeaker === "A" && (
            <span className="w-2 h-2 rounded-full bg-[#a78bfa] animate-ping shrink-0 mr-1" />
          )}
        </div>

        {/* Host B Speaker Card */}
        <div className={`p-3.5 rounded-2xl border transition-all duration-500 flex items-center gap-3 relative overflow-hidden ${
          !isJoined && playing && currentSpeaker === "B"
            ? "bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] scale-[1.01]" 
            : "bg-white/[0.02] border-white/5 opacity-60"
        }`}>
          {!isJoined && playing && currentSpeaker === "B" && (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.15),transparent)] pointer-events-none" />
          )}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-all duration-300 ${
            !isJoined && playing && currentSpeaker === "B" 
              ? "bg-emerald-500 border-emerald-400 scale-105" 
              : "bg-white/5 border-white/10"
          }`}>
            <User className={`w-4 h-4 ${!isJoined && playing && currentSpeaker === "B" ? "text-white" : "text-slate-400"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase">Speaker Host B</span>
            <p className="text-xs font-bold text-white truncate">Analogy Specialist</p>
          </div>
          {!isJoined && playing && currentSpeaker === "B" && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0 mr-1" />
          )}
        </div>
      </div>

      {/* 3. Fully Customized Interactive Studio Controller Deck */}
      <div className="p-4 rounded-3xl bg-black/40 border border-white/5 flex flex-col gap-3.5">
        
        {/* Scrubber Progress Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={currentTime}
            onChange={(e) => handleSeek([parseFloat(e.target.value)])}
            disabled={isGenerating || !audioBlobUrl || isJoined}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Studio Player Dashboard Controls */}
        <div className="flex items-center justify-between gap-3">
          
          {/* Mute & Volume Bar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              disabled={isGenerating || !audioBlobUrl || isJoined}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              disabled={isGenerating || !audioBlobUrl || isMuted || isJoined}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-14 sm:w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white opacity-60 hover:opacity-100 transition-opacity"
            />
          </div>

          {/* Core Play / Stop Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlay}
              disabled={isGenerating || isJoined}
              className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all duration-300 active:scale-95 shadow-[0_0_15px_rgba(99,102,241,0.2)] disabled:opacity-40 disabled:cursor-not-allowed ${
                playing 
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500 hover:text-white" 
                  : "bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500"
              }`}
            >
              {isGenerating ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : playing ? (
                <Square className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* Quick Speed & Downloader Utilities */}
          <div className="flex items-center gap-2">
            {/* Speed Rate Adjuster */}
            <button
              onClick={handleSpeedChange}
              disabled={isGenerating || !audioBlobUrl || isJoined}
              className="px-2.5 py-1.5 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-white/10 text-slate-400 hover:text-white text-xs font-mono font-bold flex items-center gap-1 transition-all disabled:opacity-40"
              title="Adjust playback rate"
            >
              <FastForward className="w-3.5 h-3.5" />
              {playbackRate}x
            </button>

            {/* Interactive Live Join Button (P5.2) */}
            <button
              onClick={() => {
                setIsJoined(!isJoined);
                if (playing) {
                  if (audioRef.current) audioRef.current.pause();
                  setPlaying(false);
                }
              }}
              disabled={isGenerating || script.length === 0}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                isJoined
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)] animate-pulse"
                  : "bg-white/[0.03] border-white/5 text-slate-400 hover:text-white"
              }`}
              title={isJoined ? "Leave live microphone session" : "Join the podcast desk live as Host C"}
            >
              {isJoined ? <LogOut className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
              {isJoined ? "Leave Desk" : "Join Desk"}
            </button>

            {/* Downloader Trigger */}
            {audioBlobUrl ? (
              <a
                href={audioBlobUrl}
                download={`acumen_podcast_${sessionId}.wav`}
                className="p-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all shadow-[0_0_10px_rgba(99,102,241,0.1)] flex items-center justify-center"
                title="Download Studio Recording"
              >
                <Download className="w-4 h-4" />
              </a>
            ) : (
              <button
                disabled
                className="p-2 rounded-xl border border-white/5 bg-white/[0.01] text-slate-600 cursor-not-allowed flex items-center justify-center"
                title="Download disabled until synthesized"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>

        </div>
      </div>

      {/* 4. Live Desk Interactive Intervention Console (P5.2 Overlay) */}
      {isJoined ? (
        <div className="flex flex-col gap-3 p-4 rounded-3xl bg-black/40 border border-amber-500/15 relative overflow-hidden animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Sparkles className="w-20 h-20 text-amber-500 animate-pulse" />
          </div>
          
          <div className="flex items-center justify-between pb-2 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span className="text-[10px] font-mono font-bold tracking-widest text-amber-400 uppercase">Live Interruption Desk Feed</span>
            </div>
            <span className="text-[9px] font-mono text-slate-500 uppercase">You are Host C</span>
          </div>

          <div className="space-y-3.5 overflow-y-auto max-h-[220px] min-h-[120px] px-1 py-3 custom-scrollbar flex flex-col">
            {liveHistory.map((line: ScriptLine, idx: number) => {
              const isUser = line.host === "C";
              return (
                <div 
                  key={idx} 
                  className={`flex flex-col gap-1 transition-all ${
                    isUser ? "items-end" : "items-start"
                  }`}
                >
                  <span className={`text-[8px] font-mono uppercase font-bold tracking-wider ${
                    line.host === "A" 
                      ? "text-indigo-400" 
                      : line.host === "B" 
                        ? "text-emerald-400" 
                        : "text-amber-400"
                  }`}>
                    {line.host === "A" 
                      ? "Host A (Explainer)" 
                      : line.host === "B" 
                        ? "Host B (Analogy)" 
                        : "Host C (You)"}
                  </span>
                  <p className={`text-xs p-3 rounded-[1.2rem] max-w-[85%] border leading-relaxed ${
                    line.host === "A"
                      ? "bg-[#7c3aed]/15 border-[#7c3aed]/30 text-white"
                      : line.host === "B"
                        ? "bg-emerald-500/15 border-emerald-500/30 text-white"
                        : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                  }`}>
                    {line.text}
                  </p>
                </div>
              );
            })}
            
            {isDeskReplying && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 italic pl-1 mt-1 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                Co-hosts are discussing your point live...
              </div>
            )}
            <div ref={liveDeskEndRef} />
          </div>

          {/* User Interruption Form */}
          <form
            onSubmit={handleSendDeskInterruption}
            className="flex items-center w-full gap-2 px-3 py-2 bg-white/[0.02] border border-white/10 rounded-2xl focus-within:border-amber-500/40 transition-all duration-300"
          >
            <input
              type="text"
              placeholder="Interrupt hosts with your question/observation..."
              value={deskInput}
              onChange={(e) => setDeskInput(e.target.value)}
              disabled={isDeskReplying}
              className="w-full text-xs bg-transparent border-none outline-none text-slate-200 placeholder-slate-600 font-medium"
            />
            
            {/* Standard Speech-to-Text Trigger */}
            <button
              type="button"
              onClick={handleDeskMicrophone}
              disabled={isDeskReplying}
              className={`p-1.5 rounded-lg transition-colors flex items-center justify-center shrink-0 ${
                isListening 
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse" 
                  : "hover:bg-white/5 text-slate-500 hover:text-white"
              }`}
              title="Interrupt via Microphone (Web Speech)"
            >
              <Mic className="w-3.5 h-3.5" />
            </button>

            <button
              type="submit"
              disabled={isDeskReplying || !deskInput.trim()}
              className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[10px] font-mono uppercase tracking-wider rounded-xl transition-all font-bold shrink-0"
            >
              send
            </button>
          </form>
        </div>
      ) : (
        /* 5. Speech-Tracking Scrolling Transcripts Section */
        <div className="relative">
          {/* Subtle Top Fade Layer */}
          <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-[#0f0f15] to-transparent z-10 pointer-events-none" />
          
          <div 
            ref={scriptContainerRef}
            className="space-y-3.5 overflow-y-auto max-h-[220px] px-1 py-6 scroll-smooth select-none custom-scrollbar relative border border-white/5 bg-black/[0.15] rounded-3xl"
          >
            {loadingScript ? (
              <div className="flex flex-col gap-3 p-4">
                <div className="h-4 w-3/4 bg-white/5 animate-pulse rounded-full" />
                <div className="h-4 w-1/2 bg-white/5 animate-pulse rounded-full" />
                <div className="h-4 w-2/3 bg-white/5 animate-pulse rounded-full" />
              </div>
            ) : script.length > 0 ? (
              script.map((line: ScriptLine, i: number) => {
                const isActive = activeLineIndex === i;
                return (
                  <div 
                    key={i} 
                    id={`podcast-bubble-${i}`}
                    className={`flex flex-col gap-1 transition-all duration-300 relative group p-1.5 rounded-2xl ${
                      line.host === "A" ? "items-start" : "items-end"
                    }`}
                  >
                    <div className="flex items-center gap-2 px-1">
                      <span className={`text-[9px] font-mono uppercase font-bold tracking-widest ${
                        isActive 
                          ? (line.host === "A" ? "text-indigo-400" : "text-emerald-400") 
                          : "text-slate-600"
                      }`}>
                        Host {line.host === "A" ? "A (Explainer)" : "B (Analogy)"}
                      </span>
                    </div>

                    <div className="flex items-end gap-2 max-w-[85%] relative">
                      <p className={`text-xs p-3.5 rounded-[1.4rem] leading-relaxed select-text shadow-md border transition-all duration-300 ${
                        isActive
                          ? line.host === "A"
                            ? "bg-[#7c3aed]/25 border-[#7c3aed]/45 text-white glow-purple-sm scale-[1.01]"
                            : "bg-emerald-500/25 border-emerald-500/45 text-white shadow-[0_0_15px_rgba(16,185,129,0.12)] scale-[1.01]"
                          : line.host === "A"
                            ? "bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-300"
                            : "bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-300"
                      }`}>
                        {line.text}
                      </p>

                      {/* Copy single line button */}
                      <button
                        onClick={() => copyToClipboard(line.text, i)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white shrink-0 absolute -right-9 bottom-1.5 hidden sm:flex"
                        title="Copy bubble text"
                      >
                        {copiedText === i ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2.5 text-center text-slate-500 px-4">
                <Sparkles className="w-8 h-8 text-slate-700 animate-pulse" />
                <p className="text-xs font-medium">Synthesizing deep-dive podcast script overview…</p>
              </div>
            )}
          </div>

          {/* Subtle Bottom Fade Layer */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0f0f15] to-transparent z-10 pointer-events-none" />
        </div>
      )}
      
    </div>
  );
}
