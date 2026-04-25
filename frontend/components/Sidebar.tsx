"use client";

import { Notebook } from "@/lib/types";
import { Plus, BookText, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";

interface SidebarProps {
  notebooks: Notebook[];
  activeNotebookId: string | null;
  onSelectNotebook: (id: string) => void;
  onNewNotebook: () => void;
}

export default function Sidebar({
  notebooks,
  activeNotebookId,
  onSelectNotebook,
  onNewNotebook,
}: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (id: string) => {
    onSelectNotebook(id);
    setMobileOpen(false);
  };

  const handleNew = () => {
    onNewNotebook();
    setMobileOpen(false);
  };

  const renderContent = () => (
    <div className="flex flex-col h-full bg-[#0a0a0b]/40 backdrop-blur-xl border-r border-white/5 w-64 md:w-full">
      <div className="p-5 border-b border-white/5">
        <button
          onClick={handleNew}
          className="flex items-center justify-center w-full gap-2 px-4 py-2.5 text-xs font-mono uppercase tracking-[0.2em] text-white transition-all bg-indigo-600 rounded-xl hover:bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.2)] hover:shadow-[0_0_25px_rgba(79,70,229,0.4)]"
        >
          <Plus className="w-3.5 h-3.5" />
          Initialize
        </button>
      </div>

      <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar">
        {notebooks.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <BookText className="w-8 h-8 text-white/10 mx-auto mb-3" />
            <p className="text-[11px] font-mono uppercase tracking-widest text-white/30">
              Vault Empty
            </p>
          </div>
        ) : (
          notebooks.map((nb) => {
            const isActive = activeNotebookId === nb.id;
            const dateStr = nb.created_at 
              ? new Date(nb.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
              : 'N/A';
            
            return (
              <button
                key={nb.id}
                onClick={() => handleSelect(nb.id)}
                className={`group relative flex flex-col w-full p-4 transition-all duration-300 rounded-xl border ${
                  isActive
                    ? "bg-white/[0.05] border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
                    : "bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04] hover:shadow-[0_0_15px_rgba(255,255,255,0.02)]"
                }`}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <div className="absolute left-0 top-4 bottom-4 w-[2px] bg-indigo-500 rounded-r-full" />
                )}

                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-indigo-400/80">
                    {dateStr}
                  </span>
                  {nb.sourceType && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/10 text-white/40 uppercase">
                      {nb.sourceType}
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <BookText className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? "text-indigo-400" : "text-white/20"}`} />
                  <span className={`text-sm font-medium truncate ${isActive ? "text-white" : "text-white/70 group-hover:text-white"}`}>
                    {nb.title}
                  </span>
                </div>

                {/* Sub-label */}
                <div className="mt-2 pl-7">
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full bg-indigo-500/50 transition-all duration-500 ${isActive ? "w-full" : "w-0"}`} 
                    />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col shrink-0">
        {renderContent()}
      </aside>

      {/* Mobile Hamburger Trigger */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button className="p-2 text-slate-400 hover:text-white bg-[#0a0a0f]/80 backdrop-blur border border-slate-800 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 border-r border-slate-800 w-64 bg-[#0a0a0f]">
            <SheetHeader className="sr-only">
               <SheetTitle>Notebooks</SheetTitle>
            </SheetHeader>
            {renderContent()}
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
