"use client";

import { useState } from "react";
import {
  Globe,
  BookOpen,
  Database,
  Server,
  TrendingUp,
  CheckSquare,
  Square,
  Download,
  RotateCcw,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface ToolOutputProps {
  toolName: string;
  output: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FLASHCARDS — CSS 3D flip on click
// ─────────────────────────────────────────────────────────────────────────────
function FlashcardDeck({ cards }: { cards: { q: string; a: string }[] }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  const toggle = (i: number) =>
    setFlipped((prev) => ({ ...prev, [i]: !prev[i] }));

  const resetAll = () => setFlipped({});

  return (
    <div className="mt-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-[#7c3aed]" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Flashcards · {cards.length} cards
          </span>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset all
        </button>
      </div>

      <p className="text-[11px] text-slate-500 px-1">Click a card to reveal the answer</p>

      <div className="grid grid-cols-1 gap-3">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`flip-card ${flipped[i] ? "is-flipped" : ""}`}
            onClick={() => toggle(i)}
          >
            <div className="flip-card-inner">
              {/* Front — Question */}
              <div className="flip-card-front">
                <div className="px-4 py-2 border-b border-white/8 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#7c3aed] tracking-widest uppercase">
                    Q {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="ml-auto text-[10px] text-slate-600">tap to flip →</span>
                </div>
                <div className="flex-1 flex items-center px-4 py-3">
                  <p className="text-sm font-medium text-white leading-snug">{card.q}</p>
                </div>
              </div>

              {/* Back — Answer */}
              <div className="flip-card-back">
                <div className="px-4 py-2 border-b border-[#7c3aed]/30 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#a78bfa] tracking-widest uppercase">
                    Answer
                  </span>
                </div>
                <div className="flex-1 flex items-center px-4 py-3">
                  <p className="text-sm text-[#c4b5fd] leading-relaxed">{card.a}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ARCHITECTURE — Sleek cards with icons
// ─────────────────────────────────────────────────────────────────────────────
function ArchCard({
  data,
}: {
  data: { databases: string[]; apis: string[]; scaling: string };
}) {
  const sections = [
    {
      icon: Database,
      label: "Databases",
      items: data.databases,
      color: "#7c3aed",
      bg: "rgba(124,58,237,0.08)",
      border: "rgba(124,58,237,0.25)",
    },
    {
      icon: Server,
      label: "APIs & Services",
      items: data.apis,
      color: "#06b6d4",
      bg: "rgba(6,182,212,0.08)",
      border: "rgba(6,182,212,0.25)",
    },
  ];

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2 px-1">
        <TrendingUp className="w-3.5 h-3.5 text-[#7c3aed]" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Architecture Recommendations
        </span>
      </div>

      {sections.map(({ icon: Icon, label, items, color, bg, border }) => (
        <div
          key={label}
          className="rounded-xl p-4 border"
          style={{ background: bg, borderColor: border }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="arch-icon-badge"
              style={{ background: `${color}20`, border: `1px solid ${color}40` }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color }}
            >
              {label}
            </span>
          </div>
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: color }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Scaling */}
      <div
        className="rounded-xl p-4 border"
        style={{
          background: "rgba(16,185,129,0.08)",
          borderColor: "rgba(16,185,129,0.25)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="arch-icon-badge"
            style={{
              background: "rgba(16,185,129,0.15)",
              border: "1px solid rgba(16,185,129,0.3)",
            }}
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#10b981]" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#10b981]">
            Scaling Strategy
          </span>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{data.scaling}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACTION ITEMS — Interactive checklist with Priority
// ─────────────────────────────────────────────────────────────────────────────
function ActionList({ items }: { items: { task: string; priority: string }[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const toggle = (i: number) =>
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));

  const doneCount = Object.values(checked).filter(Boolean).length;

  const getPriorityColor = (p: string) => {
    switch (p.toLowerCase()) {
      case "high": return "bg-red-500/10 text-red-400 border-red-500/30";
      case "medium": return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "low": return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      default: return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <Card className="mt-3 bg-[#0a0a0f] border-white/10 shadow-2xl">
      <CardHeader className="pb-3 px-4 pt-4 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-[#10b981]" />
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Extracted Action Items
          </CardTitle>
        </div>
        <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-slate-400">
          {doneCount}/{items.length} Completed
        </Badge>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="w-full h-1.5 rounded-full bg-white/5 mb-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#10b981] to-[#06b6d4] transition-all duration-500"
            style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
          />
        </div>

        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-200
                ${checked[i] ? "bg-white/[0.02] border-transparent opacity-60" : "bg-white/[0.04] border-white/5 hover:border-white/10"}
              `}
            >
              <Checkbox
                id={`task-${i}`}
                checked={checked[i]}
                onCheckedChange={() => toggle(i)}
                className="mt-0.5 border-slate-700 data-[state=checked]:bg-[#10b981] data-[state=checked]:border-[#10b981]"
              />
              <div className="grid gap-1.5 leading-none flex-1">
                <Label
                  htmlFor={`task-${i}`}
                  className={`text-sm leading-snug cursor-pointer transition-all
                    ${checked[i] ? "line-through text-slate-500" : "text-slate-200"}
                  `}
                >
                  {item.task}
                </Label>
                {!checked[i] && (
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${getPriorityColor(item.priority)}`}>
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
// 4. CREATOR SCRIPT
// ─────────────────────────────────────────────────────────────────────────────
function CreatorScript({
  data,
}: {
  data: {
    hook: string;
    intro: string;
    core_content: { section: string; talking_points: string[] }[];
    call_to_action: string;
  };
}) {
  return (
    <div className="mt-3 space-y-3">
      {[
        { emoji: "🎣", label: "Hook", content: data.hook, color: "#f59e0b", border: "rgba(245,158,11,0.25)", bg: "rgba(245,158,11,0.07)" },
        { emoji: "🎬", label: "Intro", content: data.intro, color: "#7c3aed", border: "rgba(124,58,237,0.25)", bg: "rgba(124,58,237,0.07)" },
      ].map(({ emoji, label, content, color, border, bg }) => (
        <div key={label} className="rounded-xl p-4 border" style={{ background: bg, borderColor: border }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>
            {emoji} {label}
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">{content}</p>
        </div>
      ))}

      <div className="rounded-xl border border-[#06b6d4]/25 p-4" style={{ background: "rgba(6,182,212,0.07)" }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#06b6d4] mb-3">📋 Core Content</p>
        <div className="space-y-3">
          {data.core_content?.map((sec, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-white mb-1.5">{sec.section}</p>
              <ul className="space-y-1.5 pl-2">
                {sec.talking_points?.map((pt, j) => (
                  <li key={j} className="text-sm text-slate-400 flex gap-2 leading-relaxed">
                    <span className="text-[#06b6d4] mt-0.5 shrink-0">·</span>{pt}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#10b981]/25 p-4" style={{ background: "rgba(16,185,129,0.07)" }}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#10b981] mb-2">🚀 Call to Action</p>
        <p className="text-sm text-slate-300 leading-relaxed">{data.call_to_action}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Main dispatcher
// ─────────────────────────────────────────────────────────────────────────────
function TwitterThread({ thread }: { thread: string[] }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Viral Twitter Thread</span>
      </div>
      <div className="space-y-2">
        {thread.map((tweet, i) => (
          <div key={i} className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 relative group">
            <div className="absolute -left-2 top-4 w-5 h-5 rounded-full bg-[#0a0a0f] border border-sky-500/30 flex items-center justify-center text-[10px] font-mono text-sky-400">
              {i + 1}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed ml-2">{tweet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ToolOutput({ toolName, output }: ToolOutputProps) {
  if (!output) return null;

  try {
    if (toolName === "generate_flashcards" && Array.isArray(output))
      return <FlashcardDeck cards={output as { q: string; a: string }[]} />;

    if (toolName === "architecture_assist" && typeof output === "object")
      return <ArchCard data={output as { databases: string[]; apis: string[]; scaling: string }} />;

    if (toolName === "extract_action_items" && Array.isArray(output))
      return <ActionList items={output as { task: string; priority: string }[]} />;

    if (toolName === "generate_creator_script" && typeof output === "object")
      return (
        <CreatorScript
          data={output as { hook: string; intro: string; core_content: { section: string; talking_points: string[] }[]; call_to_action: string }}
        />
      );

    if (toolName === "generate_tweet_thread" && Array.isArray(output))
      return <TwitterThread thread={output as string[]} />;

    if (toolName === "live_web_search" || toolName === "duckduckgo_search")
      return (
        <div className="rounded-xl border border-[#06b6d4]/30 p-4 mt-3" style={{ background: "rgba(6,182,212,0.05)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-3.5 h-3.5 text-[#06b6d4]" />
            <span className="text-xs font-medium text-[#06b6d4]">Live Web Result</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{String(output)}</p>
        </div>
      );
  } catch {
    /* fall through */
  }

  return (
    <pre className="text-xs text-slate-400 bg-white/5 rounded-xl p-3 overflow-x-auto mt-2 border border-white/8">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}
