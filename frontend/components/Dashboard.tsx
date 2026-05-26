"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Brain, GitBranch, RefreshCw, LayoutPanelLeft,
  MessageSquare, Loader2, Sparkles, AlertTriangle,
  Zap, Plus, History as HistoryIcon, Library
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { UserButton, useUser, useAuth } from "@clerk/nextjs";

import WikiSheet from "@/components/WikiSheet";
import Sidebar from "@/components/Sidebar";
import ActionChat from "@/components/ActionChat";
import PodcastPlayer from "@/components/PodcastPlayer";
import AddSourceModal from "@/components/AddSourceModal";
import IngestionEngine from "@/components/IngestionEngine";
import { fetchGraphData } from "@/lib/api";
import type { WikiPage, ReactFlowNode, ReactFlowEdge, Notebook, Message, StatusResponse, ChatMessage, ChatResponse } from "@/lib/types";
import { ReactFlowProvider } from "reactflow";
import type { Node, Edge } from "reactflow";
import "../app/acumen.css";

// Shape of notebook data returned by the backend /api/notebooks endpoint
interface BackendNotebook {
  id: string;
  title: string;
  status: "processing" | "completed" | "error" | "synthesizing" | "ingesting" | undefined;
  created_at: string;
  source_type: "url" | "pdf" | undefined;
  history: Message[];
}

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

// ── Timeout-aware fetch wrapper ───────────────────────────────────────────────
async function chatWithTimeout(
  sessionId: string,
  message: string,
  history: ChatMessage[],
  token: string | null,
  timeoutMs = 30_000
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ session_id: sessionId, message, history }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Backend error response:", text);
      let detail = `Server error ${res.status}`;
      try {
        const d = JSON.parse(text);
        if (d.detail) detail = d.detail;
      } catch {}
      throw new Error(detail);
    }
    return res.json();
  } catch (e: unknown) {
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === "AbortError")
      throw new Error("Request timed out after 30 seconds. The agent may still be processing.");
    throw e;
  }
}

export default function Dashboard() {
  const { getToken } = useAuth();
  const { isSignedIn } = useUser();

  const [view, setView] = useState<"workspace" | "library">("workspace");
  const [appState, setAppState] = useState<AppState>("idle");
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const hasLoadedInitialRef = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Persistence: Save active sessionId to localStorage
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem("acumen_active_session", sessionId);
    } else {
      localStorage.removeItem("acumen_active_session");
    }
  }, [sessionId]);

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
  const [chatLoading, setChatLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgIdxRef = useRef(0);

  // Helper: fetch with Clerk auth header
  const authFetch = useCallback(async (url: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const fullUrl = url.startsWith("http") ? url : `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
    
    return fetch(fullUrl, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  }, [getToken]);

  // Persist to localStorage whenever notebooks change
  useEffect(() => {
    try { 
      if (notebooks.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks)); 
      }
    } catch { /* quota */ }
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

  const persistChatHistory = useCallback(async (sid: string, messages: Message[]) => {
    try {
      const token = await getToken();
      await fetch(`${API_BASE_URL}/api/notebooks/${sid}/history`, {
        method: "POST",
        body: JSON.stringify(messages),
        headers: { 
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
    } catch (e) {
      console.warn("Failed to persist history to backend:", e);
    }
  }, [getToken]);

  const loadGraphForSession = useCallback(async (sid: string) => {
    setLoadingGraph(true);
    try {
      const graphData = await fetchGraphData(sid, await getToken()) as { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] };
      const nodes: Node[] = graphData.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data }));
      const edges: Edge[] = graphData.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, animated: e.animated, style: e.style }));
      setGraphNodes(nodes);
      setGraphEdges(edges);
      
      // Enriched data: nodes now contain full wiki content (key_terms, insights)
      const pages = nodes.map((n) => ({ 
        cluster_id: n.data.cluster_id, 
        topic_title: n.data.label, 
        summary: n.data.summary, 
        key_terms: n.data.key_terms || [], 
        insights: n.data.insights || [] 
      }));
      setWikiPages(pages);
      
      setAppState("ready");
      toast.success(`Graph loaded — ${nodes.length} topics discovered`);

      // Initialize welcome message if history is empty
      setNotebooks((prev: Notebook[]) => prev.map((nb: Notebook) => {
        if (nb.id === sid && (!nb.history || nb.history.length === 0)) {
          const welcomeMsg: Message = {
            role: "assistant",
            content: `✨ Knowledge base ready — ${nodes.length} topics synthesised.\n\nUse the quick actions below or ask me anything about your document.`,
          };
          const updatedHistory = [welcomeMsg];
          persistChatHistory(sid, updatedHistory);
          return { ...nb, history: updatedHistory };
        }
        return nb;
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load graph");
      setAppState("error");
    } finally {
      setLoadingGraph(false);
    }
  }, [getToken, persistChatHistory]);

  const stopPolling = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (pollRef.current) { 
      clearInterval(pollRef.current); 
      pollRef.current = null; 
    }
  }, []);

  const stopProgress = useCallback(() => {
    if (progressTimerRef.current) { 
      clearInterval(progressTimerRef.current); 
      progressTimerRef.current = null; 
    }
  }, []);

  // Standard short polling fallback
  const startPollingFallback = useCallback((sid: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await authFetch(`/status/${sid}`);
        if (!res.ok) { 
          stopPolling(); 
          stopProgress(); 
          setAppState("error"); 
          toast.error("Synthesis failed on server."); 
          return; 
        }
        const data: StatusResponse = await res.json();
        if (data.status === "completed") {
          stopPolling(); 
          stopProgress();
          setProgressValue(100);
          await new Promise((r) => setTimeout(r, 400));
          await loadGraphForSession(sid);
          toast.success("✨ Knowledge Graph synthesized!", { duration: 4000 });
        } else if (data.status === "error") {
          stopPolling(); 
          stopProgress(); 
          setAppState("error"); 
          toast.error("Synthesis failed. Please try again.");
        }
      } catch { /* keep polling */ }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, stopProgress, authFetch, loadGraphForSession]);

  // High performance SSE connection
  const startSSEConnection = useCallback(async (sid: string) => {
    stopPolling();
    stopProgress();

    // Start progress simulation (smooth initial progress)
    setProgressValue(5);
    msgIdxRef.current = 0;
    setProgressMessage(SYNTHESIS_MESSAGES[0]);
    progressTimerRef.current = setInterval(() => {
      setProgressValue((p: number) => Math.min(p + (95 - p) * 0.07, 94));
      msgIdxRef.current = (msgIdxRef.current + 1) % SYNTHESIS_MESSAGES.length;
      setProgressMessage(SYNTHESIS_MESSAGES[msgIdxRef.current]);
    }, 1800);

    try {
      const token = await getToken();
      // Browser EventSource does not support headers, so pass authorization token via query string securely
      const url = `${API_BASE_URL}/status/${sid}/stream${token ? `?token=${token}` : ""}`;
      
      const eventSource = new EventSource(url);
      sseRef.current = eventSource;

      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[SSE Status Update]", data);

          if (data.status === "completed") {
            eventSource.close();
            sseRef.current = null;
            stopProgress();
            setProgressValue(100);
            await new Promise((r) => setTimeout(r, 400));
            await loadGraphForSession(sid);
            toast.success("✨ Knowledge Graph synthesized!", { duration: 4000 });
          } else if (data.status === "error") {
            eventSource.close();
            sseRef.current = null;
            stopProgress();
            setAppState("error");
            toast.error("Synthesis failed. Please try again.");
          } else if (data.status === "ingesting" || data.status === "synthesizing" || data.status === "processing") {
            setAppState("synthesizing");
            if (data.status === "ingesting") {
              setProgressMessage("Extracting document semantic structure...");
            } else if (data.status === "synthesizing") {
              setProgressMessage("Running KMeans ML clustering and LangGraph swarm...");
            }
          }
        } catch (err) {
          console.error("Failed to parse SSE data:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE connection error, falling back to HTTP Polling:", err);
        eventSource.close();
        sseRef.current = null;
        startPollingFallback(sid);
      };

    } catch (err) {
      console.error("Failed to initialize SSE:", err);
      startPollingFallback(sid);
    }
  }, [getToken, loadGraphForSession, stopPolling, stopProgress, startPollingFallback]);

  useEffect(() => () => { stopPolling(); stopProgress(); }, [stopPolling, stopProgress]);

  const handleUploadComplete = useCallback(async (sid: string, fname: string) => {
    setSessionId(sid);
    setFilename(fname);
    setNotebooks((prev: Notebook[]) => prev.some((nb: Notebook) => nb.id === sid) ? prev : [...prev, { id: sid, title: fname, history: [], sourceType: "pdf", created_at: new Date().toISOString() }]);
    try {
      await authFetch(`/synthesize/${sid}`, { method: "POST" });
      setAppState("synthesizing"); 
      await startSSEConnection(sid);
      toast.info("Knowledge synthesis initiated…", { duration: 3000 });
    } catch { 
      toast.error("Synthesis initiation failed."); 
      setAppState("error"); 
    }
  }, [authFetch, startSSEConnection]);

  const handleStartSynthesis = useCallback(async (sid: string) => {
    setAppState("synthesizing");
    await startSSEConnection(sid);
  }, [startSSEConnection]);

  const handleSourceAdded = useCallback(async (sid: string) => {
    setAppState("synthesizing");
    await startSSEConnection(sid);
    toast.info("Synthesizing new source...", { duration: 3000 });
  }, [startSSEConnection]);

  const handleNewNotebook = useCallback(() => {
    stopPolling(); 
    stopProgress();
    setSessionId(null); 
    setFilename(""); 
    setGraphNodes([]); 
    setGraphEdges([]);
    setWikiPages([]); 
    setProgressValue(0); 
    setAppState("idle");
    toast("Switched to Dashboard", { icon: "🏠" });
  }, [stopPolling, stopProgress]);

  const handleSelectNotebook = useCallback(async (id: string) => {
    const nb = notebooks.find((n: Notebook) => n.id === id);
    if (!nb) return;
    stopPolling(); 
    stopProgress();
    setSessionId(id); 
    setFilename(nb.title); 
    setProgressValue(0);
    
    if (nb.status === "processing" || nb.status === "synthesizing" || nb.status === "ingesting") {
      setAppState("synthesizing");
      await startSSEConnection(id);
    } else {
      await loadGraphForSession(id);
    }
  }, [notebooks, stopPolling, stopProgress, loadGraphForSession, startSSEConnection]);

  // Lifted SendMessage Handler
  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !sessionId || chatLoading) return;
    const userMsg = text.trim();

    // Get current history for the session
    const currentNotebook = notebooks.find((n) => n.id === sessionId);
    const currentMessages = currentNotebook?.history || [];

    const history: ChatMessage[] = currentMessages.map((m) => {
      if (m.toolUsed && m.toolOutput) {
        const summary = typeof m.toolOutput === 'string' 
          ? m.toolOutput 
          : JSON.stringify(m.toolOutput);
        return { 
          role: m.role, 
          content: `${m.content}\n\n[Tool Result (${m.toolUsed}): ${summary}]` 
        };
      }
      return { role: m.role, content: m.content };
    });

    const updatedUserMessages = [...currentMessages, { role: "user" as const, content: userMsg }];
    
    // Update local state immediately
    setNotebooks((prev: Notebook[]) => prev.map((nb: Notebook) => 
      nb.id === sessionId ? { ...nb, history: updatedUserMessages } : nb
    ));

    setChatLoading(true);

    const slowToastId = setTimeout(
      () => toast.loading("The agent is thinking hard… this may take a moment.", { id: "slow-toast" }),
      8_000
    );

    try {
      const token = await getToken();
      const res = await chatWithTimeout(sessionId, userMsg, history, token);
      clearTimeout(slowToastId);
      toast.dismiss("slow-toast");

      const newAssistantMessage = {
        role: "assistant" as const,
        content: res.response,
        toolUsed: res.tool_used,
        toolOutput: res.tool_output,
        isWebAugmented: res.is_web_augmented,
      };

      const updatedAllMessages = [...updatedUserMessages, newAssistantMessage];

      setNotebooks((prev: Notebook[]) => prev.map((nb: Notebook) => 
        nb.id === sessionId ? { ...nb, history: updatedAllMessages } : nb
      ));

      // Persist to backend
      await persistChatHistory(sessionId, updatedAllMessages);

      if (res.is_web_augmented) {
        toast.info("Answer sourced from live web search", { icon: "🌐" });
      }
    } catch (e: unknown) {
      clearTimeout(slowToastId);
      toast.dismiss("slow-toast");

      const msg = e instanceof Error ? e.message : "Something went wrong.";
      toast.error(msg, { duration: 6000 });

      const errorMsg = { role: "assistant" as const, content: `⚠️ ${msg}` };
      const updatedErrorMessages = [...updatedUserMessages, errorMsg];

      setNotebooks((prev: Notebook[]) => prev.map((nb: Notebook) => 
        nb.id === sessionId ? { ...nb, history: updatedErrorMessages } : nb
      ));
      
      await persistChatHistory(sessionId, updatedErrorMessages);
    } finally {
      setChatLoading(false);
    }
  }, [sessionId, chatLoading, notebooks, getToken, persistChatHistory]);

  // Initial Load Effect
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const res = await authFetch("/api/notebooks");
        if (res.ok) {
          const data = await res.json() as { notebooks: BackendNotebook[] };
          const backendNotebooks: Notebook[] = data.notebooks.map((n) => ({
            id: n.id,
            title: n.title,
            status: n.status,
            created_at: n.created_at,
            sourceType: n.source_type,
            history: n.history || [],
          }));
          
          setNotebooks(backendNotebooks);

          // AUTO-RESTORE: Try to restore session from localStorage or load latest
          const savedSessionId = localStorage.getItem("acumen_active_session");
          const targetSession = (savedSessionId && backendNotebooks.find(n => n.id === savedSessionId)) 
            ? backendNotebooks.find(n => n.id === savedSessionId)
            : (backendNotebooks.length > 0 ? backendNotebooks[0] : null);

          if (targetSession) {
            setSessionId(targetSession.id);
            setFilename(targetSession.title);
            if (targetSession.status === "completed") {
              loadGraphForSession(targetSession.id);
            } else if (targetSession.status === "processing" || targetSession.status === "synthesizing" || targetSession.status === "ingesting") {
              setAppState("synthesizing");
              await startSSEConnection(targetSession.id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to sync with backend:", err);
      }
    };

    if (isSignedIn && !hasLoadedInitialRef.current) {
      loadData();
      hasLoadedInitialRef.current = true;
    }
  }, [isSignedIn, getToken, authFetch, loadGraphForSession, startSSEConnection]);

  const activeHistory = notebooks.find((n) => n.id === sessionId)?.history || [];

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar 
        notebooks={notebooks} 
        activeNotebookId={sessionId} 
        onSelectNotebook={handleSelectNotebook} 
        onNewNotebook={handleNewNotebook} 
        activeView={view}
        onViewChange={setView}
      />

      <main className="flex flex-col flex-1 min-w-0 overflow-hidden relative" style={{ background: "var(--acumen-bg)" }}>
        {/* Top Nav */}
        <header className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-white/8 shrink-0" style={{ background: "rgba(14,14,20,0.85)", backdropFilter: "blur(12px)" }}>
          <button 
            onClick={handleNewNotebook}
            className="flex items-center gap-2.5 shrink-0 md:ml-0 ml-10 group transition-all active:scale-95"
          >
            <div className="w-8 h-8 rounded-xl bg-[#7c3aed]/20 border border-[#7c3aed]/40 flex items-center justify-center glow-purple-sm group-hover:bg-[#7c3aed]/30 group-hover:border-[#7c3aed]/60 transition-all">
              <Brain className="w-4 h-4 text-[#a78bfa] group-hover:scale-110 transition-transform" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-base font-bold gradient-text tracking-tight">Acumen</span>
              <span className="text-[10px] text-slate-600 font-mono hidden lg:block">/ workspace dashboard</span>
            </div>
          </button>

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
            <button onClick={() => setActivePanel((p: ActivePanel) => p === "graph" ? "chat" : "graph")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-200 md:hidden border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#a78bfa] hover:bg-[#7c3aed]/20">
              {activePanel === "graph" ? <><MessageSquare className="w-3.5 h-3.5" /> Chat</> : <><LayoutPanelLeft className="w-3.5 h-3.5" /> Graph</>}
            </button>
          )}

          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8 ring-2 ring-[#7c3aed]/40 hover:ring-[#7c3aed] transition-all",
              },
            }}
          />
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {view === "library" ? (
            /* FULL WIDTH LIBRARY/HISTORY VIEW */
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--acumen-bg)]">
              <div className="max-w-6xl mx-auto flex flex-col px-8 py-12 gap-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <div className="flex flex-col gap-2">
                  <h2 className="text-4xl font-bold text-white tracking-tight">Knowledge Vault History</h2>
                  <p className="text-slate-400 text-lg">Browse and manage your previously synthesized intelligence assets.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Upload Card */}
                  <div className="p-10 rounded-[2.5rem] bg-white/[0.03] border border-white/10 backdrop-blur-2xl hover:bg-white/[0.05] transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Plus className="w-40 h-40 text-white" />
                    </div>
                    <div className="relative z-10 space-y-8">
                      <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center">
                        <Plus className="w-7 h-7 text-[#a78bfa]" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white mb-3">Create New Notebook</h3>
                        <p className="text-slate-400 leading-relaxed">Upload a PDF or paste a URL to initialize a new Knowledge Graph and Agent context.</p>
                      </div>
                      <IngestionEngine mode="hero" onUploadComplete={handleUploadComplete} onStartSynthesis={handleStartSynthesis} />
                    </div>
                  </div>

                  {/* Quick Stats Card */}
                  <div className="p-10 rounded-[2.5rem] bg-[#7c3aed]/5 border border-[#7c3aed]/20 backdrop-blur-2xl relative overflow-hidden">
                     <div className="flex flex-col h-full justify-between gap-10">
                       <div className="space-y-2">
                          <h3 className="text-2xl font-bold text-white">Library Insights</h3>
                          <p className="text-slate-400">Total knowledge coverage across your sessions.</p>
                       </div>
                       <div className="grid grid-cols-2 gap-6">
                          <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5">
                             <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">Total Vaults</span>
                             <div className="text-4xl font-bold text-white mt-2">{notebooks.length}</div>
                          </div>
                          <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5">
                             <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">Processed</span>
                             <div className="text-4xl font-bold text-[#10b981] mt-2">{notebooks.filter(n => n.status === "completed").length}</div>
                          </div>
                       </div>
                       <div className="flex items-center gap-3 text-sm text-[#a78bfa] bg-[#7c3aed]/10 px-4 py-2.5 rounded-2xl w-fit border border-[#7c3aed]/20">
                          <Zap className="w-4 h-4 fill-[#a78bfa]" />
                          <span className="font-semibold tracking-wide">Gemini 2.5 Flash Powered</span>
                       </div>
                     </div>
                  </div>
                </div>

                {/* Recent Activity List */}
                <div className="space-y-6 pb-20">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-[0.25em] flex items-center gap-2.5">
                      <HistoryIcon className="w-4 h-4" /> Recent Knowledge Vaults
                    </h3>
                  </div>
                  {notebooks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {notebooks.map((nb) => (
                        <button 
                          key={nb.id}
                          onClick={() => { setView("workspace"); handleSelectNotebook(nb.id); }}
                          className="flex flex-col items-start p-6 rounded-3xl bg-white/[0.015] border border-white/5 hover:border-[#7c3aed]/40 hover:bg-white/[0.04] transition-all text-left group hover:translate-y-[-4px] duration-300 shadow-xl"
                        >
                          <div className="flex items-center gap-4 mb-4 w-full">
                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-[#7c3aed]/20 transition-colors">
                              {nb.sourceType === "url" ? <GitBranch className="w-5 h-5 text-blue-400" /> : <Library className="w-5 h-5 text-[#a78bfa]" />}
                            </div>
                            <div className="flex-1 truncate">
                              <div className="text-base font-bold text-white truncate group-hover:text-[#a78bfa] transition-colors">{nb.title}</div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">{new Date(nb.created_at || "").toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 w-full pt-4 border-t border-white/5">
                             <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg">
                               <MessageSquare className="w-3 h-3" />
                               <span>{nb.history?.length || 0}</span>
                             </div>
                             <div className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${nb.status === "completed" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                               <div className={`w-1.5 h-1.5 rounded-full ${nb.status === "completed" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
                               <span className="text-[10px] font-bold uppercase tracking-wider">{nb.status}</span>
                             </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-20 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center gap-4 text-center">
                       <Library className="w-12 h-12 text-slate-700" />
                       <div className="text-slate-500">No notebooks yet. Upload your first source to begin.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* SPLIT PANE WORKSPACE */
            <>
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
                    <button onClick={() => setActivePanel((p: ActivePanel) => p === "graph" ? "chat" : "graph")}
                      className="ml-auto hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                      <MessageSquare className="w-3 h-3" /> Toggle view
                    </button>
                  )}
                </div>

                <div className="flex-1 relative overflow-hidden">
                  {/* Idle State (Workspace Mode) */}
                  {appState === "idle" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center gap-10">
                       <div className="flex flex-col gap-4 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-700">
                          <h2 className="text-3xl font-bold text-white tracking-tight">Welcome back</h2>
                          <p className="text-slate-400 text-sm leading-relaxed">
                            Your executable knowledge base is ready. What are we studying today? Upload a PDF or paste a URL to initialize a new Knowledge Graph.
                          </p>
                       </div>
                       
                       <div className="w-full max-w-md p-8 rounded-3xl bg-white/[0.03] border border-white/10 backdrop-blur-xl hover:bg-white/[0.05] transition-all group relative overflow-hidden">
                          <div className="relative z-10 space-y-6">
                            <div className="w-12 h-12 rounded-2xl bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center mx-auto">
                              <Plus className="w-6 h-6 text-[#a78bfa]" />
                            </div>
                            <IngestionEngine mode="hero" onUploadComplete={handleUploadComplete} onStartSynthesis={handleStartSynthesis} />
                          </div>
                        </div>
                    </div>
                  )}
                  {/* Synthesizing overlay */}
                  {appState === "synthesizing" && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 px-10"
                      style={{ background: "rgba(10,10,15,0.4)", backdropFilter: "blur(8px)" }}>
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
                          onNodeClick={(p: WikiPage) => { setSelectedPage(p); setSheetOpen(true); }} />
                      </ReactFlowProvider>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT — Chat + Audio */}
              <div
                className={`flex flex-col overflow-hidden transition-all duration-300 ${activePanel === "graph" ? "hidden md:flex" : "flex"} md:flex`}
                style={{ flex: 1, minWidth: 0, background: "var(--acumen-bg)" }}
              >
                {/* Audio Overview Section */}
                <div className="px-5 pt-12 pb-8 border-b border-white/5 bg-white/[0.02] shrink-0 relative z-10 mt-4">
                  <PodcastPlayer sessionId={sessionId} />
                </div>

                <ActionChat
                  sessionId={sessionId}
                  wikiPages={wikiPages}
                  messages={activeHistory}
                  loading={chatLoading}
                  sendMessage={handleSendMessage}
                />
              </div>
            </>
          )}
        </div>

        <WikiSheet 
          page={selectedPage} 
          open={sheetOpen} 
          onClose={() => setSheetOpen(false)} 
          onObsidianLink={(clusterId, noteText) => {
            (KnowledgeGraph as { addObsidianEdge?: (a: number, b: string) => void }).addObsidianEdge?.(clusterId, noteText);
          }} 
        />
      </main>
    </div>
  );
}
