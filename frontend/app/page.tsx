"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Brain, GitBranch, RefreshCw, LayoutPanelLeft,
  MessageSquare, Loader2, Sparkles, AlertTriangle,
  Zap, Network, BookOpen, ArrowRight, Headphones, Search, Layers
} from "lucide-react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import {
  SignInButton, SignUpButton, UserButton, useUser, useAuth,
} from "@clerk/nextjs";

import Dropzone from "@/components/Dropzone";
import WikiSheet from "@/components/WikiSheet";
import Sidebar from "@/components/Sidebar";
import ActionChat from "@/components/ActionChat";
import PodcastPlayer from "@/components/PodcastPlayer";
import AddSourceModal from "@/components/AddSourceModal";
import IngestionEngine from "@/components/IngestionEngine";
import { fetchGraphData } from "@/lib/api";
import type { WikiPage, ReactFlowNode, ReactFlowEdge, Notebook, Message, StatusResponse } from "@/lib/types";
import { ReactFlowProvider } from "reactflow";
import type { Node, Edge } from "reactflow";
import "../app/acumen.css";

const KnowledgeGraph = dynamic(() => import("@/components/KnowledgeGraph"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="w-12 h-12 rounded-2xl skeleton" />
      <div className="space-y-2 w-48">
        <div className="h-3 skeleton" />
        <div className="h-3 skeleton w-3/4" />
      </div>
    </div>
  ),
});

const STORAGE_KEY = "acumen_notebooks_v1";
const POLL_INTERVAL_MS = 2000;
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

const SYNTHESIS_MESSAGES = [
  "Extracting semantic clusters…",
  "Running KMeans ML pipeline…",
  "Synthesizing Wiki Pages with LangGraph…",
  "Building Knowledge Graph…",
  "Persisting to ChromaDB…",
  "Almost there…",
];

type AppState = "idle" | "synthesizing" | "ready" | "error";
type ActivePanel = "graph" | "chat";

// ─────────────────────────────────────────────
// Landing page — Claude Bento-Architecture Refactor
// ─────────────────────────────────────────────
function LandingPage() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.3 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 20 } }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e1e1e3] selection:bg-indigo-500/30 overflow-x-hidden relative">
      {/* SVG Grid Background */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] pointer-events-none opacity-40" />

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 md:px-16 py-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="text-xl font-medium tracking-tight text-white">Acumen</span>
        </div>
        <div className="flex items-center gap-4">
          <SignInButton mode="modal">
            <button className="text-sm font-mono uppercase tracking-[0.2em] text-indigo-400/80 hover:text-indigo-400 transition-colors">
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="px-5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl text-sm font-medium hover:bg-white/[0.06] transition-all">
              Join Waitlist
            </button>
          </SignUpButton>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-8 py-12 md:py-24 relative z-10">
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center gap-8 mb-24">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono uppercase tracking-[0.2em] text-indigo-400"
          >
            AGENTIC RAG 2.0 // DEPLOYED
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, filter: "blur(10px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.8 }}
            className="text-6xl md:text-8xl font-medium tracking-tight leading-[0.9] text-white"
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
              Turn Knowledge
            </span>
            <br />
            into Action.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-slate-400 text-lg md:text-xl max-w-2xl leading-relaxed"
          >
            A side-by-side RAG workspace that transforms static PDFs into a visualized 
            Knowledge Graph Swarm with an Agentic 5-tool toolkit.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 mt-4"
          >
            <SignUpButton mode="modal">
              <button className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-lg transition-all shadow-[0_0_25px_rgba(99,102,241,0.4)] hover:shadow-[0_0_35px_rgba(99,102,241,0.6)] hover:scale-[1.02]">
                Get Started Free
              </button>
            </SignUpButton>
            <button className="px-8 py-4 rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl text-white font-medium text-lg hover:bg-white/[0.06] transition-all">
              View Showcase
            </button>
          </motion.div>
        </section>

        {/* Bento Grid */}
        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[240px]"
        >
          {/* Wide Card - TOP */}
          <motion.div variants={item} className="md:col-span-12 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between group hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <div className="flex items-center justify-between">
              <Network className="w-8 h-8 text-indigo-400" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-400/60">Module // Graph</span>
            </div>
            <div>
              <h3 className="text-2xl font-medium text-white mb-2">Knowledge Graph Swarm</h3>
              <p className="text-slate-400 text-sm max-w-md">Vector space mapped to visual logic. Dagre-aligned React Flow nodes represent semantic clusters extracted via KMeans.</p>
            </div>
          </motion.div>

          {/* Square Card - LEFT */}
          <motion.div variants={item} className="md:col-span-6 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <Headphones className="w-8 h-8 text-indigo-400" />
            <div>
              <h3 className="text-xl font-medium text-white mb-2">Multimodal Synthesis</h3>
              <p className="text-slate-400 text-sm">Real-time podcast generation using Hugging Face Serverless Inference. Free, low-latency TTS streaming.</p>
            </div>
          </motion.div>

          {/* Square Card - RIGHT */}
          <motion.div variants={item} className="md:col-span-6 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <Sparkles className="w-8 h-8 text-indigo-400" />
            <div>
              <h3 className="text-xl font-medium text-white mb-2">Two-Stage Reranking</h3>
              <p className="text-slate-400 text-sm">Zero-Hallucination Retrieval. Gemini 2.5 Flash acts as a Cross-Encoder to verify context relevance before agent response.</p>
            </div>
          </motion.div>

          {/* Wide Card - BOTTOM */}
          <motion.div variants={item} className="md:col-span-12 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <div className="flex items-center gap-4">
              <Zap className="w-8 h-8 text-indigo-400" />
              <div className="flex gap-2">
                {["Search", "Cards", "Backlog", "Code", "Video"].map(t => (
                  <span key={t} className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-mono uppercase tracking-widest text-indigo-400">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-medium text-white mb-2">Agentic Tooling</h3>
              <p className="text-slate-400 text-sm max-w-2xl">LangGraph-powered Chat Agent with 5 specialized tools for deep synthesis, including live Web Search (DuckDuckGo) and structured task extraction.</p>
            </div>
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-8 py-24 border-t border-white/[0.08] text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Acumen Platform // v0.1.0-alpha // Built for the Deep Work Era
        </p>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main dashboard — shown to signed-in users
// ─────────────────────────────────────────────
function Dashboard() {
  const { getToken } = useAuth();

  const [appState, setAppState] = useState<AppState>("idle");
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [graphNodes, setGraphNodes] = useState<Node[]>([]);
  const [graphEdges, setGraphEdges] = useState<Edge[]>([]);
  const [wikiPages, setWikiPages] = useState<WikiPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>("graph");
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState(SYNTHESIS_MESSAGES[0]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgIdxRef = useRef(0);

  // Helper: fetch with Clerk auth header
  const authFetch = useCallback(async (url: string, opts: RequestInit = {}) => {
    const token = await getToken();
    return fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }, [getToken]);

  // localStorage persistence
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: Notebook[] = JSON.parse(stored);
        if (Array.isArray(parsed)) setNotebooks(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks)); }
    catch { /* quota */ }
  }, [notebooks]);

  // Wave-bar keyframes
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @keyframes wave-bar { from{transform:scaleY(.4);opacity:.6} to{transform:scaleY(1);opacity:1} }
      @keyframes progress-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
    `;
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  const loadGraphForSession = useCallback(async (sid: string) => {
    setLoadingGraph(true);
    try {
      const data = await fetchGraphData(sid, await getToken());
      const nodes: Node[] = (data.nodes as ReactFlowNode[]).map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data }));
      const edges: Edge[] = (data.edges as ReactFlowEdge[]).map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, animated: e.animated, style: e.style }));
      setGraphNodes(nodes);
      setGraphEdges(edges);
      
      // Enriched data: nodes now contain full wiki content (key_terms, insights)
      setWikiPages(nodes.map((n) => ({ 
        cluster_id: n.data.cluster_id, 
        topic_title: n.data.label, 
        summary: n.data.summary, 
        key_terms: n.data.key_terms || [], 
        insights: n.data.insights || [] 
      })));
      
      setAppState("ready");
      toast.success(`Graph loaded — ${nodes.length} topics discovered`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load graph");
      setAppState("error");
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const stopProgress = useCallback(() => {
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
  }, []);

  const startProgress = useCallback(() => {
    setProgressValue(5);
    msgIdxRef.current = 0;
    setProgressMessage(SYNTHESIS_MESSAGES[0]);
    progressTimerRef.current = setInterval(() => {
      setProgressValue((p) => Math.min(p + (90 - p) * 0.07, 89));
      msgIdxRef.current = (msgIdxRef.current + 1) % SYNTHESIS_MESSAGES.length;
      setProgressMessage(SYNTHESIS_MESSAGES[msgIdxRef.current]);
    }, 1800);
  }, []);

  const startPolling = useCallback((sid: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/status/${sid}`);
        if (!res.ok) { stopPolling(); stopProgress(); setAppState("error"); toast.error("Synthesis failed on server."); return; }
        const data: StatusResponse = await res.json();
        if (data.status === "completed") {
          stopPolling(); stopProgress();
          setProgressValue(100);
          await new Promise((r) => setTimeout(r, 400));
          await loadGraphForSession(sid);
          toast.success("✨ Knowledge Graph synthesized!", { duration: 4000 });
        } else if (data.status === "error") {
          stopPolling(); stopProgress(); setAppState("error"); toast.error("Synthesis failed. Please try again.");
        }
      } catch { /* keep polling */ }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, stopProgress, authFetch, loadGraphForSession]);

  useEffect(() => () => { stopPolling(); stopProgress(); }, [stopPolling, stopProgress]);

  const handleUploadComplete = useCallback(async (sid: string, fname: string) => {
    setSessionId(sid);
    setFilename(fname);
    setNotebooks((prev) => prev.some((nb) => nb.id === sid) ? prev : [...prev, { id: sid, title: fname, history: [], sourceType: "pdf", created_at: new Date().toISOString() }]);
    try {
      const res = await authFetch(`${API_BASE_URL}/synthesize/${sid}`, { method: "POST" });
      const data = await res.json();
      
      // Even if /upload didn't return completed, we start polling immediately
      setAppState("synthesizing"); 
      startProgress(); 
      startPolling(sid);
      toast.info("Knowledge synthesis initiated…", { duration: 3000 });
    } catch { toast.error("Synthesis initiation failed."); setAppState("error"); }
  }, [authFetch, startProgress, startPolling, loadGraphForSession]);

  const handleStartSynthesis = useCallback((sid: string) => {
    setAppState("synthesizing");
    startProgress();
    startPolling(sid);
  }, [startProgress, startPolling]);

  const handleSourceAdded = useCallback((sid: string) => {
    setAppState("synthesizing");
    startProgress();
    startPolling(sid);
    toast.info("Synthesizing new source...", { duration: 3000 });
  }, [startProgress, startPolling]);

  const handleNewNotebook = useCallback(() => {
    stopPolling(); stopProgress();
    setSessionId(null); setFilename(""); setGraphNodes([]); setGraphEdges([]);
    setWikiPages([]); setProgressValue(0); setAppState("idle");
  }, [stopPolling, stopProgress]);

  const handleSelectNotebook = useCallback(async (id: string) => {
    const nb = notebooks.find((n) => n.id === id);
    if (!nb) return;
    stopPolling(); stopProgress();
    setSessionId(id); setFilename(nb.title); setProgressValue(0);
    await loadGraphForSession(id);
  }, [notebooks, stopPolling, stopProgress, loadGraphForSession]);

  const handleChatHistoryChange = useCallback((messages: Message[]) => {
    if (!sessionId) return;
    setNotebooks((prev) => prev.map((nb) => nb.id === sessionId ? { ...nb, history: messages } : nb));
  }, [sessionId]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar notebooks={notebooks} activeNotebookId={sessionId} onSelectNotebook={handleSelectNotebook} onNewNotebook={handleNewNotebook} />

      <main className="flex flex-col flex-1 min-w-0 overflow-hidden relative" style={{ background: "var(--acumen-bg)" }}>
        {/* Top Nav */}
        <header className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/8 shrink-0" style={{ background: "rgba(14,14,20,0.85)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-2.5 shrink-0 md:ml-0 ml-10">
            <div className="w-8 h-8 rounded-xl bg-[#7c3aed]/20 border border-[#7c3aed]/40 flex items-center justify-center glow-purple-sm">
              <Brain className="w-4 h-4 text-[#a78bfa]" />
            </div>
            <span className="text-base font-bold gradient-text tracking-tight">Acumen</span>
            <span className="text-[10px] text-slate-600 font-mono mt-0.5 hidden lg:block">/ executable knowledge base</span>
          </div>

          {filename && (
            <div className="ml-2 hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/10">
                <GitBranch className="w-3 h-3 text-[#7c3aed]" />
                <span className="text-xs text-slate-300 truncate max-w-[140px] md:max-w-[200px]">{filename}</span>
              </div>
              {sessionId && <AddSourceModal sessionId={sessionId} onSourceAdded={handleSourceAdded} />}
            </div>
          )}

          <div className="flex-1" />

          {appState === "ready" && (
            <div className="hidden sm:flex items-center gap-1.5">
              <div className="pulse-dot" />
              <span className="text-xs text-[#10b981]">{graphNodes.length} topics</span>
            </div>
          )}
          {appState === "synthesizing" && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#7c3aed]/10 border border-[#7c3aed]/30">
              <Loader2 className="w-3 h-3 text-[#a78bfa] animate-spin" />
              <span className="text-xs text-[#a78bfa]">Synthesizing…</span>
            </div>
          )}
          {appState === "error" && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-xs text-red-400">Error</span>
            </div>
          )}

          {appState === "ready" && (
            <button onClick={() => setActivePanel((p) => p === "graph" ? "chat" : "graph")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 md:hidden border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa] hover:bg-[#7c3aed]/20">
              {activePanel === "graph" ? <><MessageSquare className="w-3.5 h-3.5" /> Chat</> : <><LayoutPanelLeft className="w-3.5 h-3.5" /> Graph</>}
            </button>
          )}

          {/* User Avatar */}
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8 ring-2 ring-[#7c3aed]/40 hover:ring-[#7c3aed] transition-all",
              },
            }}
          />
        </header>

        {/* Split Pane */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT — Graph */}
          <div
            className={`flex flex-col border-r border-white/8 transition-all duration-300 ${activePanel === "chat" ? "hidden md:flex" : "flex"} md:flex`}
            style={{ width: "58%", minWidth: 0, background: "var(--acumen-surface)" }}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 shrink-0">
              <LayoutPanelLeft className="w-3.5 h-3.5 text-[#7c3aed]" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Knowledge Graph</span>
              {loadingGraph && (
                <div className="ml-2 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 text-slate-500 animate-spin" />
                  <span className="text-[11px] text-slate-500">Loading…</span>
                </div>
              )}
              {appState === "ready" && (
                <button onClick={() => setActivePanel((p) => p === "graph" ? "chat" : "graph")}
                  className="ml-auto hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                  <MessageSquare className="w-3 h-3" /> Toggle view
                </button>
              )}
            </div>

            <div className="flex-1 relative overflow-hidden">
              {/* Synthesizing overlay */}
              {appState === "synthesizing" && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 px-10"
                  style={{ background: "radial-gradient(ellipse at center, rgba(124,58,237,0.08) 0%, rgba(10,10,15,0.97) 70%)" }}>
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.25),rgba(167,139,250,0.1))", border: "1px solid rgba(124,58,237,0.4)", boxShadow: "0 0 40px rgba(124,58,237,0.2)" }}>
                      <Sparkles className="w-7 h-7 text-[#a78bfa] animate-pulse" />
                    </div>
                    <h2 className="text-lg font-bold gradient-text">Synthesizing Knowledge Graph</h2>
                    <p className="text-sm text-slate-400 text-center max-w-xs">{progressMessage}</p>
                  </div>
                  <div className="w-full max-w-sm space-y-2">
                    <Progress value={progressValue} className="h-2 bg-white/5" />
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>LangGraph Swarm running…</span>
                      <span>{Math.round(progressValue)}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {[0,1,2,3,4].map((i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-[#7c3aed]/50"
                        style={{ animation: `wave-bar 0.9s ease-in-out ${i*0.15}s infinite alternate` }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Error overlay */}
              {appState === "error" && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4">
                  <AlertTriangle className="w-10 h-10 text-red-400" />
                  <p className="text-sm text-slate-400">Synthesis failed. Upload a new document to retry.</p>
                  <button onClick={handleNewNotebook}
                    className="text-xs px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors">
                    Start Over
                  </button>
                </div>
              )}

              {/* Idle — Hero Ingestion */}
              {appState === "idle" && (
                <div className="flex flex-col items-center justify-center h-full p-8">
                  <IngestionEngine 
                    mode="hero" 
                    onUploadComplete={handleUploadComplete} 
                    onStartSynthesis={handleStartSynthesis}
                  />
                  <div className="flex flex-wrap gap-2 justify-center pt-8">
                    {["KMeans Clustering","LangGraph Synthesis","5-Tool Agent","ReactFlow Graph"].map((f) => (
                      <span key={f} className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/8 text-slate-500">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Ready — graph + Compact Ingestion */}
              {appState === "ready" && (
                <div className="relative w-full h-full">
                  <div className="absolute top-4 left-4 z-40">
                    <IngestionEngine 
                      mode="compact" 
                      sessionId={sessionId} 
                      onUploadComplete={handleUploadComplete} 
                      onStartSynthesis={handleStartSynthesis}
                    />
                  </div>
                  <ReactFlowProvider>
                    <KnowledgeGraph initialNodes={graphNodes} initialEdges={graphEdges} wikiPages={wikiPages}
                      onNodeClick={(p) => { setSelectedPage(p); setSheetOpen(true); }} />
                  </ReactFlowProvider>
                </div>
              )}
            </div>
          </div>

          <div
            className={`flex flex-col overflow-hidden transition-all duration-300 ${activePanel === "graph" ? "hidden md:flex" : "flex"} md:flex`}
            style={{ flex: 1, minWidth: 0, background: "var(--acumen-bg)" }}
          >
            {/* Audio Overview Section — Padded and Separated */}
            <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02] shrink-0">
              <PodcastPlayer sessionId={sessionId || "demo-session"} />
            </div>

            <ActionChat
              sessionId={sessionId}
              wikiPages={wikiPages}
              initialMessages={notebooks.find((n) => n.id === sessionId)?.history || []}
              onMessagesChange={handleChatHistoryChange}
            />
          </div>
        </div>

        <WikiSheet page={selectedPage} open={sheetOpen} onClose={() => setSheetOpen(false)} onObsidianLink={() => {}} />
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// Root — gate on auth state
// ─────────────────────────────────────────────
export default function AcumenPage() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-[#7c3aed]/20 border border-[#7c3aed]/40 flex items-center justify-center animate-pulse">
            <Brain className="w-5 h-5 text-[#a78bfa]" />
          </div>
          <p className="text-xs text-slate-600">Loading Acumen…</p>
        </div>
      </div>
    );
  }

  return isSignedIn ? <Dashboard /> : <LandingPage />;
}
