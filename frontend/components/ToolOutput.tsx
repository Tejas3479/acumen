"use client";

import React, { Component, ErrorInfo, ReactNode, useState, useEffect, useRef } from "react";
import {
  Globe,
  BookOpen,
  Database,
  Server,
  TrendingUp,
  CheckSquare,
  RotateCcw,
  Download,
  Check,
  Play,
  Pause,
  ArrowRight,
  Heart,
  MessageCircle,
  Repeat2,
  Copy,
  ChevronLeft,
  ChevronRight,
  FileText,
  Eye,
  Sliders,
  Sparkles,
  Trophy,
  Activity,
  Maximize2
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ── Error Boundary Component ──────────────────────────────────────────────────
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("❌ [ToolOutput ErrorBoundary] caught a rendering crash:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 mt-3 text-red-400 text-xs">
          <p className="font-semibold mb-1">⚠️ Render Error in Tool Output</p>
          <p className="opacity-80 font-mono text-[10px]">
            {this.state.error?.message || "Invalid or malformed tool payload structure."}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ToolOutputProps {
  toolName: string;
  output: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FLASHCARDS — Interactive Anki-style Study System
// ─────────────────────────────────────────────────────────────────────────────
interface CardData {
  q: string;
  a: string;
}

function FlashcardDeck({ cards }: { cards: CardData[] }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [known, setKnown] = useState<Record<number, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const toggle = () => {
    setFlipped((prev) => ({ ...prev, [currentIndex]: !prev[currentIndex] }));
  };

  const markAsKnown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setKnown((prev) => ({ ...prev, [currentIndex]: true }));
    if (currentIndex < cards.length - 1) {
      setTimeout(() => {
        setFlipped((prev) => ({ ...prev, [currentIndex + 1]: false }));
        setCurrentIndex((i) => i + 1);
      }, 300);
    }
  };

  const markAsStudy = (e: React.MouseEvent) => {
    e.stopPropagation();
    setKnown((prev) => ({ ...prev, [currentIndex]: false }));
    if (currentIndex < cards.length - 1) {
      setTimeout(() => {
        setFlipped((prev) => ({ ...prev, [currentIndex + 1]: false }));
        setCurrentIndex((i) => i + 1);
      }, 300);
    }
  };

  const resetAll = () => {
    setFlipped({});
    setKnown({});
    setCurrentIndex(0);
  };

  const totalMastered = Object.values(known).filter(Boolean).length;
  const isCurrentFlipped = flipped[currentIndex] || false;

  return (
    <div className="mt-3 space-y-4">
      {/* Deck Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#7c3aed]/10 border border-[#7c3aed]/30 flex items-center justify-center">
            <BookOpen className="w-3.5 h-3.5 text-[#7c3aed]" />
          </div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Anki Flashcard Swarm
          </span>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset Deck
        </button>
      </div>

      {/* Mastery Stats Bar */}
      <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-[11px] text-slate-400">Mastery Progress</span>
        </div>
        <div className="flex-1 max-w-[120px] sm:max-w-[200px]">
          <Progress value={(totalMastered / cards.length) * 100} className="h-1.5 bg-white/5" />
        </div>
        <span className="text-[11px] font-bold text-emerald-400 font-mono">
          {totalMastered}/{cards.length} Mastered
        </span>
      </div>

      {/* Main Flashcard View */}
      <div className="flex flex-col items-center gap-4">
        <div
          className={`flip-card w-full ${isCurrentFlipped ? "is-flipped" : ""}`}
          style={{ height: "200px" }}
          onClick={toggle}
        >
          <div className="flip-card-inner">
            {/* Front — Question */}
            <div className="flip-card-front bg-gradient-to-br from-[#111118] to-[#0a0a0f] border border-[#7c3aed]/25 flex flex-col shadow-[0_0_24px_rgba(124,58,237,0.05)] rounded-[1.5rem]">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                <Badge className="bg-[#7c3aed]/10 text-[#a78bfa] border-[#7c3aed]/20 uppercase font-mono text-[9px] px-2 py-0.5">
                  Question {currentIndex + 1} of {cards.length}
                </Badge>
                <span className="text-[10px] text-slate-500 font-mono">Click to reveal answer →</span>
              </div>
              <div className="flex-1 flex items-center justify-center p-6 text-center overflow-y-auto">
                <p className="text-base font-semibold text-white leading-snug">{cards[currentIndex]?.q}</p>
              </div>
            </div>

            {/* Back — Answer */}
            <div className="flip-card-back bg-gradient-to-br from-[#120f21] to-[#0b0a12] border border-[#a78bfa]/50 flex flex-col shadow-[0_0_30px_rgba(124,58,237,0.12)] rounded-[1.5rem]">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 uppercase font-mono text-[9px] px-2 py-0.5">
                  Reveal & Grade
                </Badge>
                <span className="text-[10px] text-slate-500 font-mono">Answer revealed</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
                <p className="text-sm text-[#d8b4fe] leading-relaxed mb-4">{cards[currentIndex]?.a}</p>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={markAsStudy}
                    className="px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white transition-all text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    Review Later
                  </button>
                  <button
                    onClick={markAsKnown}
                    className="px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-300 hover:text-white transition-all text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    Got It!
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Deck Navigation Controls */}
        <div className="flex items-center gap-4 py-1">
          <button
            disabled={currentIndex === 0}
            onClick={() => {
              setFlipped((prev) => ({ ...prev, [currentIndex - 1]: false }));
              setCurrentIndex((i) => i - 1);
            }}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/10 active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono font-bold text-slate-400">
            {currentIndex + 1} / {cards.length}
          </span>
          <button
            disabled={currentIndex === cards.length - 1}
            onClick={() => {
              setFlipped((prev) => ({ ...prev, [currentIndex + 1]: false }));
              setCurrentIndex((i) => i + 1);
            }}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-white/10 active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ARCHITECTURE — Premium Visual Diagram + Component Explorer
// ─────────────────────────────────────────────────────────────────────────────
interface ArchData {
  databases: string[];
  apis: string[];
  scaling: string;
}

function ArchCard({ data }: { data: ArchData }) {
  const [activeTab, setActiveTab] = useState<"diagram" | "components" | "scaling">("diagram");

  return (
    <div className="mt-3 space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#06b6d4]/15 border border-[#06b6d4]/30 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-[#06b6d4]" />
          </div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Architecture Blueprint Explorer
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white/5 border border-white/8 p-1 rounded-2xl">
        {[
          { id: "diagram", label: "Architecture Flow", icon: Globe },
          { id: "components", label: "Spec List", icon: Database },
          { id: "scaling", label: "Scaling Engine", icon: TrendingUp },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "diagram" | "components" | "scaling")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] sm:text-xs font-semibold rounded-xl transition-all ${
                isActive
                  ? "bg-white/10 text-white shadow-lg border border-white/5"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      {activeTab === "diagram" && (
        <div className="p-6 rounded-[2rem] bg-gradient-to-br from-[#0c0c12] to-[#050508] border border-white/5 flex flex-col items-center justify-center min-h-[220px] relative overflow-hidden">
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.06),transparent)]" />
          
          <div className="relative z-10 w-full flex flex-col items-center gap-6 sm:gap-8">
            {/* Visual Box Diagram */}
            <div className="flex flex-col sm:flex-row items-center justify-between w-full max-w-md gap-4 sm:gap-0">
              
              {/* Frontend Node */}
              <div className="w-36 p-3 rounded-2xl bg-white/[0.02] border border-[#06b6d4]/40 text-center glow-cyan-sm hover:scale-105 transition-transform">
                <span className="text-[9px] font-mono text-[#06b6d4] tracking-widest uppercase">Frontend Core</span>
                <p className="text-xs font-bold text-white mt-1">NextJS WebApp</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Clerk Auth Provider</p>
              </div>

              {/* Arrow */}
              <div className="flex flex-col items-center justify-center h-4 sm:w-8 rotate-90 sm:rotate-0">
                <ArrowRight className="w-4 h-4 text-indigo-400/50 animate-pulse" />
              </div>

              {/* Backend Node */}
              <div className="w-36 p-3 rounded-2xl bg-white/[0.02] border border-[#7c3aed]/40 text-center glow-purple-sm hover:scale-105 transition-transform">
                <span className="text-[9px] font-mono text-[#a78bfa] tracking-widest uppercase">API Core</span>
                <p className="text-xs font-bold text-white mt-1">FastAPI Backend</p>
                <p className="text-[10px] text-slate-500 mt-0.5">LangGraph & RAG</p>
              </div>

            </div>

            {/* Connection Arrow Down */}
            <div className="w-[1px] h-6 bg-gradient-to-b from-[#7c3aed] to-[#10b981]" />

            {/* Persistence Layer */}
            <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-[#10b981]/30 text-center">
                <span className="text-[9px] font-mono text-[#10b981] tracking-widest uppercase">Vector DB</span>
                <p className="text-xs font-bold text-white mt-0.5">ChromaDB</p>
              </div>
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-[#10b981]/30 text-center">
                <span className="text-[9px] font-mono text-[#10b981] tracking-widest uppercase">Metadata DB</span>
                <p className="text-xs font-bold text-white mt-0.5">SQLite DB</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "components" && (
        <div className="space-y-3">
          {/* Databases */}
          <div className="p-4 rounded-[1.5rem] bg-[#7c3aed]/5 border border-[#7c3aed]/15 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-[#7c3aed]/20 flex items-center justify-center">
                <Database className="w-3 h-3 text-[#a78bfa]" />
              </div>
              <span className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">Recommended Databases</span>
            </div>
            <ul className="space-y-2">
              {data.databases?.map((db, i) => (
                <li key={i} className="flex gap-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#7c3aed] shrink-0" />
                  {db}
                </li>
              ))}
            </ul>
          </div>

          {/* APIs */}
          <div className="p-4 rounded-[1.5rem] bg-[#06b6d4]/5 border border-[#06b6d4]/15 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-[#06b6d4]/20 flex items-center justify-center">
                <Server className="w-3 h-3 text-[#22d3ee]" />
              </div>
              <span className="text-[10px] font-bold text-[#22d3ee] uppercase tracking-widest">API & Services Stack</span>
            </div>
            <ul className="space-y-2">
              {data.apis?.map((api, i) => (
                <li key={i} className="flex gap-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#06b6d4] shrink-0" />
                  {api}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTab === "scaling" && (
        <div className="p-5 rounded-[1.5rem] bg-[#10b981]/5 border border-[#10b981]/15 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#10b981]/20 flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-[#34d399]" />
            </div>
            <span className="text-[10px] font-bold text-[#34d399] uppercase tracking-widest">Scalability & Infrastructure Strategy</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">{data.scaling}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACTION ITEMS — Interactive Kanban Board Checklist
// ─────────────────────────────────────────────────────────────────────────────
interface ActionItem {
  task: string;
  priority: string;
}

function ActionList({ items }: { items: ActionItem[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const toggle = (i: number) => {
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  const doneCount = Object.values(checked).filter(Boolean).length;
  const progressPercent = items.length ? (doneCount / items.length) * 100 : 0;

  const getPriorityColor = (p: string) => {
    switch (String(p).toLowerCase()) {
      case "high":
        return "bg-red-500/10 text-red-400 border-red-500/30 glow-red-sm";
      case "medium":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "low":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    }
  };

  const filteredItems = items
    .map((item, index) => ({ ...item, index }))
    .filter((item) => filter === "all" || item.priority.toLowerCase() === filter);

  return (
    <Card className="mt-3 bg-[#0a0a0f] border-white/10 shadow-2xl rounded-[1.8rem]">
      <CardHeader className="pb-3 px-5 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#10b981]/15 border border-[#10b981]/30 flex items-center justify-center">
            <CheckSquare className="w-3.5 h-3.5 text-[#10b981]" />
          </div>
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Sprint Task Board
          </CardTitle>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {progressPercent === 100 && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1 font-mono uppercase text-[9px]">
              <Sparkles className="w-3 h-3 text-emerald-400" /> Complete!
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-slate-400">
            {doneCount}/{items.length} Closed
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="px-5 pb-5 pt-0 space-y-4">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#06b6d4] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Priority Filters */}
        <div className="flex bg-white/5 border border-white/8 p-0.5 rounded-xl">
          {["all", "high", "medium", "low"].map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p as "all" | "high" | "medium" | "low")}
              className={`flex-1 py-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                filter === p
                  ? "bg-white/10 text-white border border-white/5 shadow"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Checklist */}
        <div className="space-y-2.5">
          {filteredItems.map((item) => (
            <div
              key={item.index}
              className={`flex items-start gap-3.5 p-3 rounded-2xl border transition-all duration-200 task-item
                ${checked[item.index] ? "bg-white/[0.01] border-transparent opacity-50 checked" : "bg-white/[0.03] border-white/5 hover:border-white/8"}
              `}
            >
              <Checkbox
                id={`task-${item.index}`}
                checked={checked[item.index]}
                onCheckedChange={() => toggle(item.index)}
                className="mt-0.5 border-slate-700 data-[state=checked]:bg-[#10b981] data-[state=checked]:border-[#10b981]"
              />
              <div className="grid gap-1.5 leading-none flex-1">
                <Label
                  htmlFor={`task-${item.index}`}
                  className={`text-xs sm:text-sm leading-snug cursor-pointer transition-all task-label
                    ${checked[item.index] ? "line-through text-slate-500" : "text-slate-200"}
                  `}
                >
                  {item.task}
                </Label>
                {!checked[item.index] && (
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[8px] font-mono uppercase font-bold px-1.5 py-0.5 rounded border tracking-widest ${getPriorityColor(
                        item.priority
                      )}`}
                    >
                      {item.priority}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CREATOR SCRIPT — Teleprompter Mode
// ─────────────────────────────────────────────────────────────────────────────
interface ScriptSection {
  section: string;
  talking_points: string[];
}

interface CreatorScriptData {
  hook: string;
  intro: string;
  core_content: ScriptSection[];
  call_to_action: string;
}

function CreatorScript({ data }: { data: CreatorScriptData }) {
  const [teleprompterMode, setTeleprompterMode] = useState(false);
  const [teleprompterPlaying, setTeleprompterPlaying] = useState(false);
  const [teleprompterSpeed, setTeleprompterSpeed] = useState(2); // 1 = slow, 2 = normal, 3 = fast
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Smooth Teleprompter Scroll Animation
  useEffect(() => {
    if (!teleprompterMode || !teleprompterPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      return;
    }

    const scroll = () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += teleprompterSpeed * 0.4;
        
        // Stop scrolling when hitting bottom
        const maxScroll = scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight;
        if (scrollContainerRef.current.scrollTop >= maxScroll) {
          setTeleprompterPlaying(false);
          return;
        }
      }
      animationFrameRef.current = requestAnimationFrame(scroll);
    };

    animationFrameRef.current = requestAnimationFrame(scroll);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [teleprompterMode, teleprompterPlaying, teleprompterSpeed]);

  const toggleTeleprompter = () => {
    setTeleprompterMode((m) => {
      if (m) {
        setTeleprompterPlaying(false);
      }
      return !m;
    });
  };

  // Standard static view
  if (!teleprompterMode) {
    return (
      <div className="mt-3 space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#f59e0b]/15 border border-[#f59e0b]/30 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 text-[#f59e0b]" />
            </div>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              High-Retention Video Script
            </span>
          </div>
          <button
            onClick={toggleTeleprompter}
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[#f59e0b] hover:text-white bg-[#f59e0b]/15 px-3 py-1.5 rounded-xl border border-[#f59e0b]/30 transition-all hover:scale-[1.02]"
          >
            <Maximize2 className="w-3 h-3" /> Teleprompter Mode
          </button>
        </div>

        {[
          {
            emoji: "🎣",
            label: "Curiosity Hook",
            content: data.hook,
            color: "#f59e0b",
            border: "rgba(245,158,11,0.18)",
            bg: "rgba(245,158,11,0.04)",
          },
          {
            emoji: "🎬",
            label: "Credibility Intro",
            content: data.intro,
            color: "#7c3aed",
            border: "rgba(124,58,237,0.18)",
            bg: "rgba(124,58,237,0.04)",
          },
        ].map(({ emoji, label, content, color, border, bg }) => (
          <div
            key={label}
            className="rounded-[1.5rem] p-4 border"
            style={{ background: bg, borderColor: border }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color }}>
              {emoji} {label}
            </p>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{content}</p>
          </div>
        ))}

        {/* Core content segments */}
        <div
          className="rounded-[1.5rem] border border-[#06b6d4]/15 p-4 space-y-3"
          style={{ background: "rgba(6,182,212,0.04)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#06b6d4] mb-1">
            📋 Core Value Delivery
          </p>
          <div className="space-y-4">
            {data.core_content?.map((sec, i) => (
              <div key={i} className="space-y-1.5">
                <p className="text-sm font-semibold text-white">{sec.section}</p>
                <ul className="space-y-1.5 pl-1.5">
                  {sec.talking_points?.map((pt, j) => (
                    <li key={j} className="text-xs sm:text-sm text-slate-400 flex gap-2 leading-relaxed">
                      <span className="text-[#06b6d4] mt-0.5 shrink-0">·</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          className="rounded-[1.5rem] border border-[#10b981]/15 p-4"
          style={{ background: "rgba(16,185,129,0.04)" }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#10b981] mb-1.5">
            🚀 Engagement Closing (CTA)
          </p>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{data.call_to_action}</p>
        </div>
      </div>
    );
  }

  // Teleprompter player view
  return (
    <div className="mt-3 p-5 rounded-[2rem] bg-gradient-to-b from-[#09090d] to-[#040406] border border-white/10 relative overflow-hidden animate-in zoom-in-95 duration-300">
      
      {/* Control bar */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5 shrink-0 relative z-20">
        <span className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#f59e0b]" /> Teleprompter Player
        </span>
        <button
          onClick={toggleTeleprompter}
          className="text-[10px] font-mono uppercase tracking-widest text-slate-400 hover:text-white"
        >
          Close Player
        </button>
      </div>

      {/* Scrolling script deck */}
      <div
        ref={scrollContainerRef}
        className="h-64 overflow-y-auto px-4 py-8 space-y-8 scroll-smooth select-none custom-scrollbar relative z-10"
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="text-center text-slate-600 font-mono text-[10px] py-10 uppercase tracking-[0.25em]">
          🚀 Teleprompter Started 🚀
        </div>

        {/* Hook */}
        <div className="text-center space-y-2 max-w-lg mx-auto">
          <Badge className="bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20 text-[9px] uppercase font-mono tracking-widest mx-auto px-3.5 py-0.5 rounded-full">
            Hook (Create Curiosity)
          </Badge>
          <p className="text-base sm:text-lg font-bold text-white leading-relaxed">{data.hook}</p>
        </div>

        {/* Intro */}
        <div className="text-center space-y-2 max-w-lg mx-auto">
          <Badge className="bg-[#7c3aed]/10 text-[#a78bfa] border-[#7c3aed]/20 text-[9px] uppercase font-mono tracking-widest mx-auto px-3.5 py-0.5 rounded-full">
            Intro (Build Trust)
          </Badge>
          <p className="text-base sm:text-lg font-bold text-[#e9d5ff] leading-relaxed">{data.intro}</p>
        </div>

        {/* Core Content */}
        {data.core_content?.map((sec, i) => (
          <div key={i} className="text-center space-y-4 max-w-lg mx-auto">
            <Badge className="bg-[#06b6d4]/10 text-[#22d3ee] border-[#06b6d4]/20 text-[9px] uppercase font-mono tracking-widest mx-auto px-3.5 py-0.5 rounded-full">
              Core: {sec.section}
            </Badge>
            <div className="space-y-3">
              {sec.talking_points?.map((pt, j) => (
                <p key={j} className="text-sm font-semibold text-slate-300 leading-relaxed">
                  • {pt}
                </p>
              ))}
            </div>
          </div>
        ))}

        {/* CTA */}
        <div className="text-center space-y-2 max-w-lg mx-auto pb-10">
          <Badge className="bg-[#10b981]/10 text-[#34d399] border-[#10b981]/20 text-[9px] uppercase font-mono tracking-widest mx-auto px-3.5 py-0.5 rounded-full">
            Call to Action
          </Badge>
          <p className="text-base sm:text-lg font-bold text-[#a7f3d0] leading-relaxed">{data.call_to_action}</p>
        </div>

        <div className="text-center text-slate-600 font-mono text-[10px] py-10 uppercase tracking-[0.25em]">
          🏁 Script Complete 🏁
        </div>
      </div>

      {/* Speed & playback controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-0 pt-4 border-t border-white/5 shrink-0 relative z-20 bg-[#040406]">
        {/* Speed Adjustment */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mr-2">Scroll Speed</span>
          {[
            { label: "Slow", speed: 1 },
            { label: "Normal", speed: 2 },
            { label: "Fast", speed: 3 },
          ].map((sp) => (
            <button
              key={sp.label}
              onClick={() => setTeleprompterSpeed(sp.speed)}
              className={`px-2.5 py-1 text-[9px] font-bold rounded-lg border uppercase ${
                teleprompterSpeed === sp.speed
                  ? "bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]"
                  : "bg-white/5 border-white/5 text-slate-500"
              }`}
            >
              {sp.label}
            </button>
          ))}
        </div>

        {/* Playback Toggle */}
        <button
          onClick={() => setTeleprompterPlaying((p) => !p)}
          className="flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-xl text-black bg-[#f59e0b] hover:bg-[#d97706] transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95 shrink-0"
        >
          {teleprompterPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-current" /> Pause Script
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" /> Start Scroll
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TWITTER THREAD — Premium Mock Twitter Dark Client
// ─────────────────────────────────────────────────────────────────────────────
function TwitterThread({ thread }: { thread: string[] }) {
  const [copied, setCopied] = useState<Record<number, boolean>>({});

  const handleCopyTweet = (text: string, i: number) => {
    navigator.clipboard.writeText(text);
    setCopied((prev) => ({ ...prev, [i]: true }));
    setTimeout(() => setCopied((prev) => ({ ...prev, [i]: false })), 2000);
  };

  return (
    <div className="mt-3 space-y-4">
      {/* Thread Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
            <Globe className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Mock Twitter Thread
          </span>
        </div>
      </div>

      {/* Tweet Feed */}
      <div className="space-y-4 relative pl-3 border-l border-white/5">
        {thread.map((tweet, i) => (
          <div
            key={i}
            className="p-4 rounded-[1.5rem] bg-[#0c0d12] border border-white/5 shadow-xl relative animate-in fade-in slide-in-from-left-4 duration-300"
          >
            {/* Header info */}
            <div className="flex items-center gap-2.5 mb-2.5">
              {/* Profile Avatar */}
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#7c3aed] to-[#3b82f6] flex items-center justify-center text-[10px] font-bold text-white shadow">
                AP
              </div>
              <div className="flex flex-col leading-none">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-white hover:underline cursor-pointer">Acumen Prime</span>
                  {/* Verified Check */}
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-sky-400 fill-current">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                <span className="text-[10px] text-slate-500">@acumen_cto · Tweet {i + 1}</span>
              </div>

              {/* Copy single tweet */}
              <button
                onClick={() => handleCopyTweet(tweet, i)}
                className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
                title="Copy tweet"
              >
                {copied[i] ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* Content */}
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed pl-9 whitespace-pre-wrap select-text selection:bg-sky-500/30">
              {tweet}
            </p>

            {/* Bottom Twitter Icons and Engagement Stats */}
            <div className="flex items-center gap-6 mt-4 pl-9 text-slate-600 text-[10px] font-mono">
              <span className="flex items-center gap-1.5 hover:text-sky-400 cursor-pointer transition-colors">
                <MessageCircle className="w-3.5 h-3.5" /> {12 + i * 4}
              </span>
              <span className="flex items-center gap-1.5 hover:text-emerald-400 cursor-pointer transition-colors">
                <Repeat2 className="w-3.5 h-3.5" /> {45 + i * 12}
              </span>
              <span className="flex items-center gap-1.5 hover:text-rose-400 cursor-pointer transition-colors">
                <Heart className="w-3.5 h-3.5" /> {120 + i * 24}
              </span>
              <span className="hidden sm:inline ml-auto text-slate-600 font-sans text-[10px]">
                {2.4 + i * 0.5}K views
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. OBSIDIAN NOTE — Dual Mode Previewer (Raw MD + Live Obsidian Mock Rendering)
// ─────────────────────────────────────────────────────────────────────────────
interface ObsidianNoteData {
  filename: string;
  markdown: string;
}

function ObsidianNote({ data }: { data: ObsidianNoteData }) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"raw" | "preview">("preview");

  const handleCopy = () => {
    navigator.clipboard.writeText(data.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([data.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.filename || "acumen_note.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple Markdown to HTML parser for high-quality previewing
  const parseMarkdown = (md: string) => {
    const lines = md.split("\n");
    let inFrontmatter = false;
    let frontmatterHtml = "";
    const processedLines: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      // Parse Frontmatter
      if (line.trim() === "---" && index === 0) {
        inFrontmatter = true;
        return;
      }
      if (line.trim() === "---" && inFrontmatter) {
        inFrontmatter = false;
        processedLines.push(
          <div key={`fm-${index}`} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] font-mono text-orange-400/80 mb-4 whitespace-pre-wrap leading-relaxed select-text">
            {frontmatterHtml.trim()}
          </div>
        );
        return;
      }
      if (inFrontmatter) {
        frontmatterHtml += line + "\n";
        return;
      }

      // Headers
      if (line.startsWith("# ")) {
        processedLines.push(<h1 key={index} className="text-xl font-bold text-white mb-3 border-b border-white/5 pb-1 mt-4 select-text">{line.replace("# ", "")}</h1>);
      } else if (line.startsWith("## ")) {
        processedLines.push(<h2 key={index} className="text-base font-bold text-[#a78bfa] mb-2.5 mt-4 select-text">{line.replace("## ", "")}</h2>);
      } else if (line.startsWith("### ")) {
        processedLines.push(<h3 key={index} className="text-sm font-bold text-white mb-2 mt-4 select-text">{line.replace("### ", "")}</h3>);
      }
      // Unordered Lists
      else if (line.startsWith("- ") || line.startsWith("* ")) {
        processedLines.push(
          <li key={index} className="text-xs sm:text-sm text-slate-300 pl-4 list-disc mb-1.5 leading-relaxed select-text">
            {line.substring(2)}
          </li>
        );
      }
      // Tags
      else if (line.startsWith("#")) {
        const tags = line.split(" ");
        processedLines.push(
          <div key={index} className="flex flex-wrap gap-1.5 py-1">
            {tags.map((t, idx) => (
              <Badge key={idx} className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] px-2 py-0.5 rounded-full select-text">
                {t}
              </Badge>
            ))}
          </div>
        );
      }
      // Blank Line
      else if (!line.trim()) {
        processedLines.push(<div key={index} className="h-2" />);
      }
      // Plain Paragraphs
      else {
        processedLines.push(<p key={index} className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-1.5 select-text">{line}</p>);
      }
    });

    return processedLines;
  };

  return (
    <div className="mt-3 space-y-4">
      {/* File Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Obsidian Markdown Note
          </span>
        </div>

        {/* Action controllers */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          {/* Dual-view toggler */}
          <div className="flex bg-white/5 border border-white/8 p-0.5 rounded-lg shrink-0">
            <button
              onClick={() => setViewMode("preview")}
              className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-md transition-all flex items-center gap-1 ${
                viewMode === "preview" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Eye className="w-3 h-3" /> Live
            </button>
            <button
              onClick={() => setViewMode("raw")}
              className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded-md transition-all flex items-center gap-1 ${
                viewMode === "raw" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <FileText className="w-3 h-3" /> Source
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 hover:text-white transition-all uppercase tracking-wider shrink-0"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600/10 border border-orange-500/30 text-[10px] font-bold text-orange-400 hover:bg-orange-600 hover:text-white transition-all uppercase tracking-wider shrink-0"
            >
              <Download className="w-3 h-3" /> Get .md
            </button>
          </div>
        </div>
      </div>

      {/* Editor Body */}
      <div className="rounded-[1.8rem] border border-white/5 bg-[#08080c] p-6 max-h-[340px] overflow-y-auto custom-scrollbar shadow-2xl relative">
        <span className="absolute top-4 right-4 text-[9px] font-mono text-slate-700 bg-white/5 border border-white/5 px-2 py-0.5 rounded uppercase">
          {viewMode}
        </span>
        
        {viewMode === "raw" ? (
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed select-text scrollbar-none">
            {data.markdown}
          </pre>
        ) : (
          <div className="prose prose-invert max-w-none space-y-1">
            {parseMarkdown(data.markdown)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. WEB SEARCH RESULTS
// ─────────────────────────────────────────────────────────────────────────────
function WebSearchResult({ output }: { output: unknown }) {
  return (
    <div
      className="rounded-xl border border-[#06b6d4]/30 p-4 mt-3 shadow-xl relative animate-in fade-in duration-300"
      style={{ background: "rgba(6,182,212,0.05)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-3.5 h-3.5 text-[#06b6d4]" />
        <span className="text-xs font-semibold text-[#06b6d4] uppercase tracking-wider">Live Web Verification</span>
      </div>
      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-wrap select-text selection:bg-cyan-500/20">
        {String(output)}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. RENDERER REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RENDERERS: Record<string, (output: any) => React.ReactNode> = {
  generate_flashcards: (output) => <FlashcardDeck cards={output} />,
  architecture_assist: (output) => <ArchCard data={output} />,
  extract_action_items: (output) => <ActionList items={output} />,
  generate_creator_script: (output) => <CreatorScript data={output} />,
  generate_tweet_thread: (output) => <TwitterThread thread={output} />,
  generate_obsidian_markdown: (output) => <ObsidianNote data={output} />,
  live_web_search: (output) => <WebSearchResult output={output} />,
  duckduckgo_search: (output) => <WebSearchResult output={output} />,
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. Main Exported Dispatcher
// ─────────────────────────────────────────────────────────────────────────────
export default function ToolOutput({ toolName, output }: ToolOutputProps) {
  if (!output) return null;

  const renderFn = RENDERERS[toolName];

  return (
    <ErrorBoundary>
      {renderFn ? (
        renderFn(output)
      ) : (
        <pre className="text-xs text-slate-400 bg-white/5 rounded-xl p-3 overflow-x-auto mt-2 border border-white/8">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </ErrorBoundary>
  );
}
