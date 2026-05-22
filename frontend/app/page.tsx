"use client";

import { useUser } from "@clerk/nextjs";
import { Brain } from "lucide-react";
import LandingPage from "@/components/LandingPage";
import Dashboard from "@/components/Dashboard";

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

