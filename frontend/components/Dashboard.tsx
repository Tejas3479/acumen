"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  RefreshCw, LayoutPanelLeft, MessageSquare,
  Sparkles, AlertTriangle, Library, BookText, GitBranch
} from "lucide-react";
import { useUser, useAuth } from "@clerk/nextjs";

import WikiSheet from "@/components/WikiSheet";
import Sidebar from "@/components/Sidebar";
import ActionChat from "@/components/ActionChat";
import PodcastPlayer from "@/components/PodcastPlayer";
import IngestionEngine from "@/components/IngestionEngine";
import ArtifactStudio from "@/components/ArtifactStudio";
import SourcesManager from "@/components/SourcesManager";
import FlashcardsManager from "@/components/FlashcardsManager";
import LibraryView from "@/components/LibraryView";
import SynthesisOverlay from "@/components/SynthesisOverlay";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import WorkspaceIdle from "@/components/WorkspaceIdle";
import CommandPalette from "@/components/CommandPalette";
import { fetchGraphData } from "@/lib/api";
import type { WikiPage, ReactFlowNode, ReactFlowEdge, Notebook, Message, StatusResponse, ChatMessage } from "@/lib/types";
import { ReactFlowProvider } from "reactflow";
import type { Node, Edge } from "reactflow";
import { Group, Panel, Separator } from "react-resizable-panels";
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

export default function Dashboard() {
  const { getToken } = useAuth();
  const { isSignedIn } = useUser();

  const [view, setView] = useState<"workspace" | "library">("workspace");
  const [appState, setAppState] = useState<AppState>("idle");
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const hasLoadedInitialRef = useRef(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

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
  const [leftTab, setLeftTab] = useState<"graph" | "studio" | "sources" | "flashcards">("graph");
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState(SYNTHESIS_MESSAGES[0]);
  const [chatLoading, setChatLoading] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // Keyboard shortcut listener to toggle Command Palette (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

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

  const handleSaveGraphLayout = useCallback(async (layout: Record<string, { x: number; y: number }>) => {
    if (!sessionId) return;
    try {
      const token = await getToken();
      await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/graph-layout`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ layout }),
      });
      setGraphNodes((prevNodes) =>
        prevNodes.map((n) => {
          if (layout[n.id]) {
            return {
              ...n,
              position: { x: layout[n.id].x, y: layout[n.id].y },
            };
          }
          return n;
        })
      );
    } catch (e) {
      console.warn("Failed to save graph layout:", e);
    }
  }, [sessionId, getToken]);

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
      () => toast.loading("The swarm is thinking hard… coordinating plan.", { id: "slow-toast" }),
      8_000
    );

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: userMsg,
          history: history,
        }),
      });

      clearTimeout(slowToastId);
      toast.dismiss("slow-toast");

      if (!response.ok) {
        throw new Error(`Server error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Failed to initialize text stream reader.");

      // Insert an empty assistant message to slide in token by token
      let currentAssistantContent = "";
      let finalToolUsed: string | undefined = undefined;
      let finalToolOutput: unknown = undefined;
      let finalIsWebAugmented = false;

      setNotebooks((prev: Notebook[]) => prev.map((nb: Notebook) => {
        if (nb.id === sessionId) {
          return {
            ...nb,
            history: [...updatedUserMessages, { role: "assistant" as const, content: "🧠 Spawn Swarm Director..." }]
          };
        }
        return nb;
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          
          try {
            const rawJson = trimmed.slice(5).trim();
            const parsed = JSON.parse(rawJson);
            
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            
            if (parsed.token) {
              if (parsed.token.includes("🧠")) {
                currentAssistantContent = parsed.token;
              } else {
                if (currentAssistantContent.includes("🧠")) {
                  currentAssistantContent = ""; // Clear director thinking text when real tokens start
                }
                currentAssistantContent += parsed.token;
              }

              // Update state progressively for zero latency
              setNotebooks((prev: Notebook[]) => prev.map((nb: Notebook) => {
                if (nb.id === sessionId) {
                  const hist = [...updatedUserMessages];
                  hist.push({ role: "assistant" as const, content: currentAssistantContent });
                  return { ...nb, history: hist };
                }
                return nb;
              }));
            }
            
            if (parsed.done) {
              finalToolUsed = parsed.tool_used;
              finalToolOutput = parsed.tool_output;
              finalIsWebAugmented = parsed.is_web_augmented;
            }
          } catch {
            // Keep parsing lines silently
          }
        }
      }

      const finalAssistantMessage = {
        role: "assistant" as const,
        content: currentAssistantContent,
        toolUsed: finalToolUsed,
        toolOutput: finalToolOutput,
        isWebAugmented: finalIsWebAugmented,
      };

      const updatedAllMessages = [...updatedUserMessages, finalAssistantMessage];

      setNotebooks((prev: Notebook[]) => prev.map((nb: Notebook) => 
        nb.id === sessionId ? { ...nb, history: updatedAllMessages } : nb
      ));

      // Persist to backend
      await persistChatHistory(sessionId, updatedAllMessages);

      if (finalIsWebAugmented) {
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

  const handleTriggerSwarmFromPalette = useCallback((intent: string) => {
    let msg = "";
    if (intent === "flashcards") {
      msg = "Generate 5 technical Q&A study cards based on this document.";
      setLeftTab("flashcards");
    } else if (intent === "architecture") {
      msg = "Recommend ideal database architectures and scaling strategies for this system.";
      setLeftTab("studio");
    } else if (intent === "obsidian_note") {
      msg = "Compile this entire document context into a beautifully formatted, tagged Obsidian Markdown note.";
      setLeftTab("studio");
    }
    if (msg) {
      handleSendMessage(msg);
      toast.info(`Coordinating swarm sub-agents for ${intent}...`);
    }
  }, [handleSendMessage]);

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
    <div className="flex h-screen overflow-hidden bg-[#06060a] relative selection:bg-indigo-500/30">
      {/* Immersive Animated Gradient Mesh Background (Wow Factor Centerpiece) */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-r from-[#7c3aed]/10 to-[#06b6d4]/10 rounded-full blur-[140px] pointer-events-none opacity-60 z-0 animate-pulse duration-[8000ms]" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-gradient-to-r from-indigo-500/10 to-[#3b82f6]/5 rounded-full blur-[160px] pointer-events-none opacity-40 z-0 animate-pulse duration-[12000ms]" />
      <div className="absolute bottom-10 left-10 w-[450px] h-[450px] bg-gradient-to-r from-[#06b6d4]/5 to-transparent rounded-full blur-[120px] pointer-events-none opacity-40 z-0" />

      {/* Modern Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] pointer-events-none z-0" />

      <Sidebar 
        notebooks={notebooks} 
        activeNotebookId={sessionId} 
        onSelectNotebook={handleSelectNotebook} 
        onNewNotebook={handleNewNotebook} 
        activeView={view}
        onViewChange={setView}
      />

      <main className="flex flex-col flex-1 min-w-0 overflow-hidden relative z-10" style={{ background: "rgba(10, 10, 15, 0.45)", backdropFilter: "blur(20px)" }}>
        {/* Top Nav */}
        <WorkspaceHeader
          notebooks={notebooks}
          sessionId={sessionId}
          filename={filename}
          handleNewNotebook={handleNewNotebook}
          handleSelectNotebook={handleSelectNotebook}
          setView={setView}
          appState={appState}
          graphNodes={graphNodes}
          wikiPages={wikiPages}
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          handleSourceAdded={handleSourceAdded}
        />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {view === "library" ? (
            <LibraryView
              notebooks={notebooks}
              historySearchQuery={historySearchQuery}
              setHistorySearchQuery={setHistorySearchQuery}
              handleUploadComplete={handleUploadComplete}
              handleStartSynthesis={handleStartSynthesis}
              handleSelectNotebook={handleSelectNotebook}
              handleNewNotebook={handleNewNotebook}
              setView={setView}
            />
          ) : (
            /* SPLIT PANE WORKSPACE */
            <Group orientation="horizontal" className="flex-1 w-full h-full min-h-0">
              {/* LEFT — Graph */}
              <Panel defaultSize={58} minSize={30} maxSize={75} id="workspace-left">
                <div
                  className={`flex flex-col h-full border-r border-white/8 transition-all duration-300 ${activePanel === "chat" ? "hidden md:flex" : "flex"} md:flex`}
                  style={{ width: "100%", minWidth: 0, background: "rgba(17, 17, 24, 0.55)", backdropFilter: "blur(24px)" }}
                >
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 shrink-0 select-none overflow-x-auto custom-scrollbar">
                    {appState === "ready" ? (
                      <>
                        {([
                          { id: "graph", label: "Graph", icon: <GitBranch className="w-3.5 h-3.5" /> },
                          { id: "studio", label: "Studio", icon: <Sparkles className="w-3.5 h-3.5" /> },
                          { id: "sources", label: "Sources", icon: <Library className="w-3.5 h-3.5" /> },
                          { id: "flashcards", label: "Flashcards", icon: <BookText className="w-3.5 h-3.5" /> }
                        ] as const).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setLeftTab(t.id)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-wide border border-transparent transition-all cursor-pointer ${
                              leftTab === t.id
                                ? "bg-[#7c3aed]/15 border-[#7c3aed]/30 text-white shadow-inner"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {t.icon}
                            {t.label}
                          </button>
                        ))}
                        {loadingGraph && (
                          <div className="ml-2 flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                            <span className="text-[11px] text-slate-500 font-mono">Loading…</span>
                          </div>
                        )}
                        <button onClick={() => setActivePanel((p: ActivePanel) => p === "graph" ? "chat" : "graph")}
                          className="ml-auto hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                          <MessageSquare className="w-3 h-3" /> Toggle view
                        </button>
                      </>
                    ) : (
                      <>
                        <LayoutPanelLeft className="w-3.5 h-3.5 text-[#7c3aed]" />
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Workspace</span>
                      </>
                    )}
                  </div>

                  <div className="flex-1 relative overflow-hidden">
                    {/* Idle State (Workspace Mode) */}
                    {appState === "idle" && (
                      <WorkspaceIdle
                        handleUploadComplete={handleUploadComplete}
                        handleStartSynthesis={handleStartSynthesis}
                      />
                    )}
                    {/* Synthesizing overlay (Premium AI command console checklist) */}
                    {appState === "synthesizing" && (
                      <SynthesisOverlay progressValue={progressValue} progressMessage={progressMessage} />
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
                      <div className="relative w-full h-full flex flex-col min-h-0">
                        {leftTab === "graph" && (
                          <div className="relative w-full h-full flex-1">
                            <div className="absolute top-4 left-4 z-40">
                              <IngestionEngine 
                                mode="compact" 
                                sessionId={sessionId} 
                                onUploadComplete={handleUploadComplete} 
                                onStartSynthesis={handleStartSynthesis}
                              />
                            </div>
                            <ReactFlowProvider>
                              <KnowledgeGraph 
                                initialNodes={graphNodes} 
                                initialEdges={graphEdges} 
                                wikiPages={wikiPages}
                                onNodeClick={(p: WikiPage) => { setSelectedPage(p); setSheetOpen(true); }}
                                onLayoutSave={handleSaveGraphLayout}
                                sessionId={sessionId || ""}
                              />
                            </ReactFlowProvider>
                          </div>
                        )}
                        
                        {leftTab === "studio" && sessionId && (
                          <ArtifactStudio sessionId={sessionId} />
                        )}

                        {leftTab === "sources" && sessionId && (
                          <SourcesManager sessionId={sessionId} onSourceDeleted={() => handleSourceAdded(sessionId)} />
                        )}

                        {leftTab === "flashcards" && sessionId && (
                          <FlashcardsManager sessionId={sessionId} wikiPages={wikiPages} />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              {/* VERTICAL DRAG RESIZE HANDLE */}
              <Separator className="hidden md:block w-1 hover:w-1.5 bg-white/[0.04] hover:bg-[#7c3aed]/40 border-l border-white/5 cursor-col-resize transition-all duration-300" />

              {/* RIGHT — Chat + Audio */}
              <Panel defaultSize={42} minSize={25} maxSize={70} id="workspace-right">
                <div
                  className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${activePanel === "graph" ? "hidden md:flex" : "flex"} md:flex`}
                  style={{ width: "100%", minWidth: 0, background: "rgba(10, 10, 15, 0.45)", backdropFilter: "blur(24px)" }}
                >
                  {/* Audio Overview Section */}
                  <div className="px-5 pt-12 pb-8 border-b border-white/5 bg-white/[0.02] shrink-0 relative z-10 mt-4">
                    <PodcastPlayer sessionId={sessionId} />
                  </div>

                  <ActionChat
                    sessionId={sessionId}
                    messages={activeHistory}
                    loading={chatLoading}
                    sendMessage={handleSendMessage}
                  />
                </div>
              </Panel>
            </Group>
          )}
        </div>

        <WikiSheet 
          page={selectedPage} 
          open={sheetOpen} 
          onClose={() => setSheetOpen(false)} 
          onObsidianLink={() => {}} 
          sessionId={sessionId || ""}
        />

        <CommandPalette
          wikiPages={wikiPages}
          isOpen={cmdPaletteOpen}
          onClose={() => setCmdPaletteOpen(false)}
          onSelectTopic={(page) => {
            setSelectedPage(page);
            setSheetOpen(true);
          }}
          onTriggerSwarm={handleTriggerSwarmFromPalette}
          onViewChange={setView}
        />
      </main>
    </div>
  );
}
