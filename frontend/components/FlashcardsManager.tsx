"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { 
  Check, AlertCircle, RotateCw, ArrowLeft, ArrowRight, BookMarked
} from "lucide-react";
import type { WikiPage } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

interface FlashcardsManagerProps {
  sessionId: string;
  wikiPages: WikiPage[];
}

interface Card {
  id: string;
  term: string;
  definition: string;
  topicTitle: string;
}

export default function FlashcardsManager({ sessionId, wikiPages }: FlashcardsManagerProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [progress, setProgress] = useState<Record<string, "known" | "review">>({});

  // 1. Compile flashcards dynamically from wiki pages terms
  useEffect(() => {
    if (!wikiPages || wikiPages.length === 0) return;

    const compiledCards: Card[] = [];
    wikiPages.forEach((page) => {
      const terms = page.key_terms || [];
      terms.forEach((term, idx) => {
        // Find definition from insights or summary
        const matchingInsight = page.insights?.[idx % page.insights.length] || page.summary;
        compiledCards.push({
          id: `card_${page.cluster_id}_${idx}`,
          term,
          definition: matchingInsight,
          topicTitle: page.topic_title
        });
      });
    });

    setCards(compiledCards);
  }, [wikiPages]);

  // 2. Fetch persistent progress on mount
  useEffect(() => {
    if (!sessionId) return;

    const fetchProgress = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/flashcard-progress`);
        if (res.ok) {
          const data = await res.json();
          setProgress(data.progress || {});
        }
      } catch (err) {
        console.error("Failed to load flashcard progress:", err);
      }
    };

    fetchProgress();
  }, [sessionId]);

  // 3. Save progress on known/review changes
  const saveProgress = async (updatedProgress: Record<string, "known" | "review">) => {
    if (!sessionId) return;
    try {
      await fetch(`${API_BASE_URL}/api/notebooks/${sessionId}/flashcard-progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress: updatedProgress }),
      });
    } catch (err) {
      console.error("Failed to save flashcard progress:", err);
    }
  };

  const handleMark = (cardId: string, status: "known" | "review") => {
    const updated = { ...progress, [cardId]: status };
    setProgress(updated);
    saveProgress(updated);
    toast.success(status === "known" ? "Marked as Mastered! 🎉" : "Added to study list 📚", { duration: 1500 });
    
    // Auto advance after short delay
    setTimeout(() => {
      if (currentIndex < cards.length - 1) {
        handleNext();
      }
    }, 600);
  };

  const handleNext = () => {
    setIsFlipped(false);
    setCurrentIndex(prev => Math.min(prev + 1, cards.length - 1));
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  };

  if (wikiPages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
        <BookMarked className="w-12 h-12 text-slate-700 animate-pulse" />
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Flashcards Ephemeral</h3>
          <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
            Flashcards are compiled dynamically from your synthesized Wiki Pages. Initialize synthesis first.
          </p>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
        <RotateCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="text-xs text-slate-500 font-mono">Compiling terminology cards...</span>
      </div>
    );
  }

  const activeCard = cards[currentIndex];
  const activeStatus = progress[activeCard.id];

  const masteredCount = Object.values(progress).filter(v => v === "known").length;
  const reviewCount = Object.values(progress).filter(v => v === "review").length;
  const percentComplete = cards.length > 0 ? Math.round((Object.keys(progress).length / cards.length) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4 shrink-0 gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-indigo-400" />
            Interactive Flashcards
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-mono">Master document terminology with persistent got-it/study states</p>
        </div>

        {/* Progress Metrics */}
        <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400 bg-white/[0.02] border border-white/5 px-3 py-1.5 rounded-xl">
          <span className="text-emerald-400 font-bold">{masteredCount} MASTERED</span>
          <span>•</span>
          <span className="text-indigo-400 font-bold">{reviewCount} STUDY</span>
          <span>•</span>
          <span>{percentComplete}% COMPLETED</span>
        </div>
      </div>

      {/* Main Flashcard Interface */}
      <div className="flex-1 flex flex-col justify-center items-center py-6 min-h-0 select-none">
        {/* Active Card */}
        <div 
          onClick={() => setIsFlipped(!isFlipped)}
          className={`w-full max-w-sm h-64 rounded-[2rem] border relative cursor-pointer transition-all duration-500 transform preserve-3d shadow-2xl ${
            isFlipped ? "rotate-y-180 border-[#7c3aed]/40" : "border-white/10 hover:border-white/20"
          }`}
          style={{ background: "rgba(255,255,255,0.015)", backdropFilter: "blur(10px)" }}
        >
          {/* Front of Card */}
          <div className="absolute inset-0 flex flex-col p-8 backface-hidden justify-between">
            <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 w-fit">
              {activeCard.topicTitle}
            </span>
            
            <div className="text-center font-bold text-lg md:text-xl text-white px-2 leading-snug">
              {activeCard.term}
            </div>

            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono uppercase tracking-wider">
              <RotateCw className="w-3.5 h-3.5" />
              Click to flip
            </div>
          </div>

          {/* Back of Card */}
          <div className="absolute inset-0 flex flex-col p-8 backface-hidden rotate-y-180 justify-between">
            <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 w-fit">
              Explanation
            </span>

            <div className="text-slate-300 text-xs md:text-sm leading-relaxed text-center overflow-y-auto max-h-36 custom-scrollbar px-2">
              {activeCard.definition}
            </div>

            <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500 font-mono uppercase tracking-wider">
              <RotateCw className="w-3.5 h-3.5" />
              Click to flip
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col items-center gap-4 mt-6 w-full">
          {/* Got it / Review Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleMark(activeCard.id, "review")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-xs font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeStatus === "review"
                  ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-indigo-500/30 hover:text-indigo-400 hover:bg-indigo-500/5"
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              Study
            </button>
            
            <button
              onClick={() => handleMark(activeCard.id, "known")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border text-xs font-mono uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeStatus === "known"
                  ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-400 hover:bg-emerald-500/5"
              }`}
            >
              <Check className="w-4 h-4 shrink-0" />
              Got it
            </button>
          </div>

          {/* Navigation Arrows */}
          <div className="flex items-center gap-4 font-mono text-xs text-slate-500">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            
            <span>{currentIndex + 1} of {cards.length}</span>
            
            <button
              onClick={handleNext}
              disabled={currentIndex === cards.length - 1}
              className="p-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-all cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
