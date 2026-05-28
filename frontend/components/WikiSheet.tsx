/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Lightbulb,
  Tag,
  StickyNote,
  Code2,
  ExternalLink,
  Plus,
  X,
  Copy,
  Check,
  Download,
  Loader2,
} from "lucide-react";
import type { WikiPage } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

interface WikiSheetProps {
  page: WikiPage | null;
  open: boolean;
  onClose: () => void;
  onObsidianLink: (clusterId: number, noteText: string) => void;
  sessionId: string;
}

// ── Code Snippets Tab ────────────────────────────────────────────────────────
interface CodeSnippetsTabProps {
  snippets: { lang: string; code: string }[];
  onChange: (snippets: { lang: string; code: string }[]) => void;
}

function CodeSnippetsTab({ snippets, onChange }: CodeSnippetsTabProps) {
  const [copied, setCopied] = useState<number | null>(null);

  const add = () => onChange([...snippets, { lang: "python", code: "" }]);
  const remove = (i: number) => onChange(snippets.filter((_, j) => j !== i));

  const update = (i: number, field: "lang" | "code", val: string) => {
    const updated = snippets.map((sn, j) => (j === i ? { ...sn, [field]: val } : sn));
    onChange(updated);
  };

  const copy = (i: number, code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(i);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">Save code snippets related to this topic</p>
        <button
          onClick={add}
          className="flex items-center gap-1 text-[11px] text-[#7c3aed] hover:text-[#a78bfa] transition-colors"
        >
          <Plus className="w-3 h-3" /> Add snippet
        </button>
      </div>

      {snippets.map((sn, i) => (
        <div key={i} className="rounded-xl border border-white/10 overflow-hidden bg-black/25">
          {/* Snippet toolbar */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 border-b border-white/8 bg-white/[0.02]"
          >
            <Code2 className="w-3 h-3 text-slate-500" />
            <select
              value={sn.lang}
              onChange={(e) => update(i, "lang", e.target.value)}
              className="text-[11px] bg-transparent text-slate-400 outline-none cursor-pointer"
            >
              {["python", "typescript", "javascript", "sql", "bash", "json", "yaml"].map((l) => (
                <option key={l} value={l} className="bg-[#111118] text-slate-300">{l}</option>
              ))}
            </select>
            <span className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => copy(i, sn.code)}
                className="text-[10px] text-slate-500 hover:text-white transition-colors flex items-center gap-1"
              >
                {copied === i ? <Check className="w-3 h-3 text-[#10b981]" /> : <Copy className="w-3 h-3" />}
              </button>
              {snippets.length > 1 && (
                <button onClick={() => remove(i)}>
                  <X className="w-3 h-3 text-slate-600 hover:text-red-400 transition-colors" />
                </button>
              )}
            </span>
          </div>
          <textarea
            value={sn.code}
            onChange={(e) => update(i, "code", e.target.value)}
            rows={6}
            placeholder={`# ${sn.lang} snippet…`}
            className="w-full bg-transparent resize-none text-xs text-slate-300 font-mono
              px-4 py-3 outline-none placeholder:text-slate-700 leading-relaxed"
          />
        </div>
      ))}
    </div>
  );
}

// ── External Links Tab ───────────────────────────────────────────────────────
interface ExternalLinksTabProps {
  links: { url: string; label: string }[];
  onChange: (links: { url: string; label: string }[]) => void;
}

function ExternalLinksTab({ links, onChange }: ExternalLinksTabProps) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  const add = () => {
    if (!url.trim()) return;
    const safeUrl = url.startsWith("http") ? url : `https://${url}`;
    const updated = [...links, { url: safeUrl, label: label || safeUrl }];
    onChange(updated);
    setUrl("");
    setLabel("");
  };

  const remove = (i: number) => {
    onChange(links.filter((_, j) => j !== i));
  };

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="rounded-xl border border-white/10 p-4 space-y-2.5 bg-black/20">
        <p className="text-[11px] text-slate-500">Add reference links for this topic</p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-full bg-white/5 rounded-lg border border-white/10 px-3 py-2
            text-sm text-slate-300 placeholder:text-slate-600 outline-none
            focus:border-[#7c3aed]/50 transition-colors"
        />
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="https://..."
            className="flex-1 bg-white/5 rounded-lg border border-white/10 px-3 py-2
              text-sm text-slate-300 placeholder:text-slate-600 outline-none
              focus:border-[#7c3aed]/50 transition-colors"
          />
          <button
            onClick={add}
            className="px-3 py-2 rounded-lg bg-[#7c3aed]/20 border border-[#7c3aed]/30
              text-xs text-[#a78bfa] hover:bg-[#7c3aed]/30 transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Links list */}
      {links.length === 0 ? (
        <p className="text-center text-xs text-slate-600 py-4">No links saved yet</p>
      ) : (
        <ul className="space-y-2">
          {links.map((lk, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 p-3 rounded-xl border border-white/8
                bg-white/3 group"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#06b6d4] shrink-0" />
              <a
                href={lk.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-300 hover:text-white truncate flex-1 transition-colors"
              >
                {lk.label}
              </a>
              <button
                onClick={() => remove(i)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5 text-slate-600 hover:text-red-400 transition-colors" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main WikiSheet ───────────────────────────────────────────────────────────
export default function WikiSheet({ page, open, onClose, onObsidianLink, sessionId }: WikiSheetProps) {
  const [note, setNote] = useState("");
  const [snippets, setSnippets] = useState<{ lang: string; code: string }[]>([]);
  const [links, setLinks] = useState<{ url: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // 1. Fetch persistent notes, snippets, and links on sheet open or topic change
  useEffect(() => {
    if (!open || !page || !sessionId) return;

    // Reset components to loading states
    setNote("");
    setSnippets([{ lang: "python", code: "" }]);
    setLinks([]);
    setLoading(true);

    const fetchWorkspaceNotes = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/notes`);
        if (res.ok) {
          const data = await res.json();
          
          // Set persistent note text
          if (data.notes && data.notes[page.cluster_id]) {
            setNote(data.notes[page.cluster_id]);
          }

          // Set persistent snippets
          if (data.snippets && data.snippets[page.cluster_id]) {
            setSnippets(data.snippets[page.cluster_id]);
          } else {
            setSnippets([{ lang: "python", code: "" }]);
          }

          // Set persistent links
          if (data.links && data.links[page.cluster_id]) {
            setLinks(data.links[page.cluster_id]);
          } else {
            setLinks([]);
          }
        }
      } catch (err) {
        console.error("Failed to load workspace persistence:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspaceNotes();
  }, [page?.cluster_id, open, sessionId]);

  // 2. Debounced save to DB
  const saveWorkspaceData = async (
    updatedNote: string,
    updatedSnippets: { lang: string; code: string }[],
    updatedLinks: { url: string; label: string }[]
  ) => {
    if (!page || !sessionId) return;

    try {
      // Fetch latest global notebook notes dictionary first to avoid overwriting other clusters
      const res = await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/notes`);
      let notesDict: Record<string, string> = {};
      let snippetsDict: Record<string, any> = {};
      let linksDict: Record<string, any> = {};

      if (res.ok) {
        const data = await res.json();
        notesDict = data.notes || {};
        snippetsDict = data.snippets || {};
        linksDict = data.links || {};
        
        // Safety casts if types loaded as legacy arrays
        if (Array.isArray(snippetsDict)) snippetsDict = {};
        if (Array.isArray(linksDict)) linksDict = {};
      }

      notesDict[page.cluster_id.toString()] = updatedNote;
      snippetsDict[page.cluster_id.toString()] = updatedSnippets;
      linksDict[page.cluster_id.toString()] = updatedLinks;

      await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notesDict,
          snippets: snippetsDict,
          links: linksDict,
        }),
      });
    } catch (err) {
      console.error("Failed to save workspace persistence:", err);
    }
  };

  const handleNoteChange = (val: string) => {
    setNote(val);
    onObsidianLink(page!.cluster_id, val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveWorkspaceData(val, snippets, links);
    }, 800);
  };

  const handleSnippetsChange = (updatedSnippets: { lang: string; code: string }[]) => {
    setSnippets(updatedSnippets);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveWorkspaceData(note, updatedSnippets, links);
    }, 800);
  };

  const handleLinksChange = (updatedLinks: { url: string; label: string }[]) => {
    setLinks(updatedLinks);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      saveWorkspaceData(note, snippets, updatedLinks);
    }, 800);
  };

  if (!page) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-[440px] sm:w-[500px] flex flex-col gap-0 p-0 border-l border-white/10"
        style={{ background: "rgba(14,14,20,0.97)", backdropFilter: "blur(20px)" }}
      >
        {/* ── Wiki Header ─────────────────────────────────────────────── */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono text-[#7c3aed] tracking-widest uppercase">
              Topic {page.cluster_id}
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-[#7c3aed]/40 to-transparent" />
            <button
              onClick={() => {
                const md = `# ${page.topic_title}\n\n## Summary\n${page.summary}\n\n## Key Terms\n${page.key_terms.map(t => `- ${t}`).join("\n")}\n\n## Insights\n${page.insights.map(i => `- ${i}`).join("\n")}\n\n#acumen #knowledge-base`;
                const blob = new Blob([md], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${page.topic_title.toLowerCase().replace(/\s+/g, "_")}.md`;
                a.click();
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <Download className="w-3 h-3" /> Export MD
            </button>
          </div>
          <SheetTitle className="text-lg font-bold text-white leading-tight">
            {page.topic_title}
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-400 leading-relaxed mt-1">
            {page.summary}
          </SheetDescription>
        </SheetHeader>

        {/* ── Wiki meta (key terms + insights) ────────────────────────── */}
        <div className="px-6 py-4 space-y-4 border-b border-white/8 shrink-0">
          {/* Key Terms */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-3.5 h-3.5 text-[#7c3aed]" />
              <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Key Terms</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {page.key_terms.length > 0
                ? page.key_terms.map((term) => (
                    <Badge
                      key={term}
                      variant="secondary"
                      className="text-xs px-2 py-0.5 bg-[#7c3aed]/10 border border-[#7c3aed]/25 text-slate-300"
                    >
                      {term}
                    </Badge>
                  ))
                : <p className="text-xs text-slate-600 italic">No key terms extracted yet</p>}
            </div>
          </div>

          {/* Insights */}
          {page.insights.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Insights</h3>
              </div>
              <ul className="space-y-1.5">
                {page.insights.slice(0, 3).map((ins, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-400 leading-relaxed">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400/60 shrink-0" />
                    {ins}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <Tabs defaultValue="notes" className="flex flex-col flex-1 overflow-hidden">
          <TabsList
            className="mx-6 mt-4 mb-0 grid grid-cols-3 shrink-0"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <TabsTrigger value="notes" className="text-xs gap-1.5 data-[state=active]:bg-[#7c3aed]/30 data-[state=active]:text-white">
              <StickyNote className="w-3 h-3" /> Notes
            </TabsTrigger>
            <TabsTrigger value="code" className="text-xs gap-1.5 data-[state=active]:bg-[#7c3aed]/30 data-[state=active]:text-white">
              <Code2 className="w-3 h-3" /> Code
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs gap-1.5 data-[state=active]:bg-[#7c3aed]/30 data-[state=active]:text-white">
              <ExternalLink className="w-3 h-3" /> Links
            </TabsTrigger>
          </TabsList>

          {/* Notes tab */}
          <TabsContent value="notes" className="flex-1 overflow-y-auto px-6 py-4 space-y-3 mt-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 text-[#7c3aed] animate-spin" />
                <span className="text-xs text-slate-500 font-mono">Syncing notes with SQLite...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3 text-[#7c3aed]" />
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Obsidian-style notes</span>
                  </div>
                  <span className="text-[10px] text-slate-600">[[Topic Name]] to link nodes</span>
                </div>

                <Textarea
                  value={note}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder={`Your notes for "${page.topic_title}"…\n\nType [[Another Topic]] to draw a live edge on the graph.`}
                  className="min-h-[180px] resize-none bg-white/5 border-white/10 text-sm text-slate-300
                    placeholder:text-slate-700 focus:border-[#10b981]/50 rounded-xl font-mono"
                />

                {note.includes("[[") && (
                  <div className="flex items-center gap-2 text-[11px] text-[#10b981] px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                    Bidirectional link detected — graph edge drawn
                  </div>
                )}

                {/* Regex match preview */}
                {note.match(/\[\[([^\]]+)\]\]/g) && (
                  <div className="rounded-lg border border-[#10b981]/20 p-3 bg-[#10b981]/5">
                    <p className="text-[10px] text-[#10b981] font-medium mb-1.5">Linked nodes:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...note.matchAll(/\[\[([^\]]+)\]\]/g)].map((m, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                          {m[1]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Code tab */}
          <TabsContent value="code" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 text-[#7c3aed] animate-spin" />
                <span className="text-xs text-slate-500 font-mono">Syncing code snippets...</span>
              </div>
            ) : (
              <CodeSnippetsTab snippets={snippets} onChange={handleSnippetsChange} />
            )}
          </TabsContent>

          {/* Links tab */}
          <TabsContent value="links" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 text-[#7c3aed] animate-spin" />
                <span className="text-xs text-slate-500 font-mono">Syncing references...</span>
              </div>
            ) : (
              <ExternalLinksTab links={links} onChange={handleLinksChange} />
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
