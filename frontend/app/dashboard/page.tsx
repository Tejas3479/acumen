"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Plus, BookText, Calendar, Loader2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface NotebookSummary {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

import { BASE as API_BASE_URL } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    async function loadNotebooks() {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/notebooks`);
        if (res.ok) {
          const data = await res.json();
          setNotebooks(data.notebooks);
        }
      } catch (err) {
        console.error("Failed to fetch notebooks", err);
      } finally {
        setLoading(false);
      }
    }
    loadNotebooks();
  }, [authFetch]);

  // Sidebar needs a Notebook[] type, which has history array. We can map summary to that type.
  const sidebarNotebooks = notebooks.map(n => ({ id: n.id, title: n.title, history: [] }));

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      {/* Reusing Sidebar */}
      <Sidebar 
        notebooks={sidebarNotebooks} 
        activeNotebookId={null} 
        onSelectNotebook={(id) => router.push(`/?sessionId=${id}`)}
        onNewNotebook={() => router.push("/")}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--acumen-bg)" }}>
        <div className="max-w-6xl mx-auto px-6 py-10 md:px-10 md:py-12">
          
          <div className="mb-10">
            <h1 className="text-3xl md:text-4xl font-bold gradient-text tracking-tight mb-2">My Knowledge Base</h1>
            <p className="text-slate-400">View and manage your historical synthesized documents.</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-[#7c3aed] animate-spin" />
                <p className="text-sm text-slate-500">Loading library...</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* 1. Create New Notebook Card */}
              <button
                onClick={() => router.push("/")}
                className="flex flex-col items-center justify-center gap-4 p-8 h-48 rounded-2xl border-2 border-dashed border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#7c3aed]/50 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-[#7c3aed]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-[#a78bfa]" />
                </div>
                <p className="font-semibold text-slate-300 group-hover:text-white transition-colors">Create New Notebook</p>
              </button>

              {/* 2. Historical Notebooks */}
              {notebooks.map((nb) => (
                <div
                  key={nb.id}
                  onClick={() => router.push(`/?sessionId=${nb.id}`)}
                  className="flex flex-col h-48 p-5 rounded-2xl border border-white/10 bg-[#0e0e14] hover:border-[#7c3aed]/40 hover:shadow-[0_0_20px_rgba(124,58,237,0.15)] transition-all cursor-pointer group relative overflow-hidden"
                >
                  {/* Status Badge */}
                  <div className="flex justify-between items-start mb-4">
                    <div className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center gap-1.5 ${
                      nb.status === 'completed' 
                        ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                        : nb.status === 'processing'
                        ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {nb.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {nb.status}
                    </div>
                    
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <BookText className="w-4 h-4 text-[#a78bfa]" />
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-white leading-tight line-clamp-2 mb-auto group-hover:text-[#a78bfa] transition-colors">
                    {nb.title}
                  </h3>

                  {/* Date */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-4 border-t border-white/5 pt-4">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(nb.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
