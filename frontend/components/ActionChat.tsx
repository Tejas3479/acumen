"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Zap, Loader2, BookOpen, Cpu, ListTodo, Clapperboard, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WikiPage, Message } from "@/lib/types";
import ToolOutput from "@/components/ToolOutput";

interface ActionChatProps {
  sessionId: string | null;
  wikiPages: WikiPage[];
  messages: Message[];
  loading: boolean;
  sendMessage: (text: string) => Promise<void>;
}

// ── Quick-action palette config ───────────────────────────────────────────────
const ACTIONS = [
  { icon: BookOpen,   label: "Flashcards",   prompt: "Generate flashcards so I can study this document.",  color: "#7c3aed" },
  { icon: Cpu,        label: "Architecture", prompt: "What architecture should I use to build this system?", color: "#06b6d4" },
  { icon: ListTodo,   label: "Action Items", prompt: "Extract all action items and tasks from this document.", color: "#10b981" },
  { icon: Clapperboard, label: "Creator Script", prompt: "Write a YouTube creator script based on this document.", color: "#f59e0b" },
  { icon: Share2,    label: "Viral Thread", prompt: "Write a 5-part viral Twitter thread based on this document.", color: "#3b82f6" },
  { icon: BookOpen,   label: "Obsidian Note", prompt: "Format this knowledge into a clean, professional Obsidian Markdown note.", color: "#f97316" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
export default function ActionChat({ sessionId, messages, loading, sendMessage }: ActionChatProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (text: string) => {
    if (!text.trim() || !sessionId || loading) return;
    const toSend = text.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    await sendMessage(toSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const disabled = !sessionId;

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-white/8 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#7c3aed]/20 border border-[#7c3aed]/30 flex items-center justify-center">
          <Zap className="w-4 h-4 text-[#7c3aed]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white leading-none mb-0.5">Action Agent</h2>
          <p className="text-[11px] text-slate-500">5 tools · LangGraph ReAct · GPT-4o</p>
        </div>
        {sessionId && (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="pulse-dot" />
            <span className="text-[11px] text-[#10b981]">Live</span>
          </div>
        )}
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {!sessionId ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#7c3aed]/10 to-[#06b6d4]/10 border border-white/8 flex items-center justify-center">
              <Zap className="w-9 h-9 text-slate-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Action Agent Standby</p>
              <p className="text-xs text-slate-600 mt-1">Upload a PDF to activate</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>

              {/* Meta badges — above the bubble */}
              {(msg.isWebAugmented || msg.content.includes("[SEARCH_SOURCE: DUCKDUCKGO]")) && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <Badge variant="outline" className="bg-[#de5833]/10 border-[#de5833]/30 text-[#de5833] glow-orange-sm text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1.5 font-medium">
                    <img src="https://duckduckgo.com/favicon.ico" alt="DDG" className="w-3 h-3" />
                    Verified via DuckDuckGo
                  </Badge>
                  {msg.toolUsed && (
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium font-mono uppercase">
                      {msg.toolUsed.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              )}
              {(!msg.isWebAugmented && !msg.content.includes("[SEARCH_SOURCE: DUCKDUCKGO]") && msg.toolUsed) && (
                <div className="flex flex-wrap items-center gap-2 px-1">
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium font-mono uppercase">
                    {msg.toolUsed.replace(/_/g, " ")}
                  </span>
                </div>
              )}

              {/* Bubble */}
              <div
                className={`max-w-[88%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === "user" ? "bg-white/[0.05] text-white border border-white/10 rounded-2xl rounded-tr-sm" : "bg-white/[0.02] text-slate-200 border border-white/5 rounded-2xl rounded-tl-sm"}`}
              >
                {(() => {
                  const cleaned = msg.content.replace(/\[SOURCE: WEB\]\s*/g, "").replace(/\[SEARCH_SOURCE: DUCKDUCKGO\]\s*/g, "").trim();
                  try {
                    const parsed = JSON.parse(cleaned);
                    if (Array.isArray(parsed) && parsed.length > 0 && "task" in parsed[0]) {
                      return <ToolOutput toolName="extract_action_items" output={parsed} />;
                    }
                  } catch {}
                  return cleaned;
                })()}
              </div>

              {/* Rich tool output — full width below bubble */}
              {Boolean(msg.toolOutput) && msg.toolUsed && (
                <div className="w-full max-w-[98%]">
                  <ToolOutput toolName={msg.toolUsed} output={msg.toolOutput} />
                </div>
              )}
            </div>
          ))
        )}

        {/* Thinking indicator */}
        {loading && (
          <div className="flex items-start">
            <div className="chat-bubble-ai px-4 py-3 flex items-center gap-2.5">
              <Loader2 className="w-3.5 h-3.5 text-[#7c3aed] animate-spin" />
              <span className="text-xs text-slate-400">Agent thinking…</span>
              <div className="flex gap-0.5">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="w-1 h-1 rounded-full bg-slate-600"
                    style={{ animation: `pulse-dot 1.2s ease-in-out ${d * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Action Palette ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 border-t border-white/8 shrink-0">
        <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-2 px-1">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(({ icon: Icon, label, prompt, color }) => (
            <button
              key={label}
              disabled={disabled || loading}
              onClick={() => handleSend(prompt)}
              className="action-pill"
            >
              <Icon className="w-3 h-3" style={{ color }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div
          className={`flex gap-2 items-end rounded-xl border px-3 py-2.5 transition-all duration-200
            ${disabled
              ? "border-white/5 opacity-40"
              : "border-white/10 focus-within:border-[#7c3aed]/50 focus-within:shadow-[0_0_16px_rgba(124,58,237,0.12)]"
            }`}
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            disabled={disabled}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "Upload a PDF first…" : "Ask anything about your document…"}
            className="flex-1 bg-transparent resize-none text-sm text-white
              placeholder:text-slate-600 outline-none leading-relaxed
              overflow-y-auto scrollbar-none"
            style={{ maxHeight: "120px" }}
          />
          <button
            onClick={() => handleSend(input)}
            disabled={disabled || loading || !input.trim()}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0
              bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-30
              transition-all duration-200 disabled:cursor-not-allowed
              hover:shadow-[0_0_12px_rgba(124,58,237,0.5)]"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              : <Send className="w-3.5 h-3.5 text-white" />
            }
          </button>
        </div>
        <p className="text-[10px] text-slate-700 mt-1.5 px-1">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
