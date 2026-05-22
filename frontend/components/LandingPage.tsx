"use client";

import { motion } from "framer-motion";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { toast } from "sonner";
import { Brain, Network, Headphones, Sparkles, Zap } from "lucide-react";

export default function LandingPage() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.3 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 20 } }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e1e1e3] selection:bg-indigo-500/30 overflow-x-hidden relative">
      {/* SVG Grid Background */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center pointer-events-none opacity-20" />

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 md:px-16 py-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="text-xl font-medium tracking-tight text-white">Acumen</span>
        </div>
        <div className="flex items-center gap-4">
          <SignInButton mode="modal">
            <button className="text-sm font-mono uppercase tracking-[0.2em] text-indigo-400/80 hover:text-indigo-400 transition-colors">
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="px-5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-xl text-sm font-medium hover:bg-white/[0.06] transition-all">
              Join Waitlist
            </button>
          </SignUpButton>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-8 py-12 md:py-24 relative z-10">
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center gap-8 mb-24">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono uppercase tracking-[0.2em] text-indigo-400"
          >
            AGENTIC RAG 2.0 // DEPLOYED
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, filter: "blur(10px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.8 }}
            className="text-6xl md:text-8xl font-medium tracking-tight leading-[0.9] text-white"
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/50">
              Turn Knowledge
            </span>
            <br />
            into Action.
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-slate-400 text-lg md:text-xl max-w-2xl leading-relaxed"
          >
            A side-by-side RAG workspace that transforms static PDFs into a visualized 
            Knowledge Graph Swarm with an Agentic 5-tool toolkit.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 mt-4"
          >
            <SignUpButton mode="modal">
              <button className="px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-lg transition-all shadow-[0_0_25px_rgba(99,102,241,0.4)] hover:shadow-[0_0_35px_rgba(99,102,241,0.6)] hover:scale-[1.02]">
                Initialize Workspace
              </button>
            </SignUpButton>
            <button 
              onClick={() => toast.success("Loading Demo Workspace...", { description: "Syncing with Acumen Prime Swarm." })}
              className="px-8 py-4 rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl text-white font-medium text-lg hover:bg-white/[0.06] transition-all"
            >
              Live Demo
            </button>
          </motion.div>
        </section>

        {/* Bento Grid */}
        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[240px]"
        >
          {/* Wide Card - TOP */}
          <motion.div variants={item} className="md:col-span-12 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between group hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <div className="flex items-center justify-between">
              <Network className="w-8 h-8 text-indigo-400" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-indigo-400/60">Module // Graph</span>
            </div>
            <div>
              <h3 className="text-2xl font-medium text-white mb-2">Knowledge Graph Swarm</h3>
              <p className="text-slate-400 text-sm max-w-md">Vector space mapped to visual logic. Dagre-aligned React Flow nodes represent semantic clusters extracted via KMeans.</p>
            </div>
          </motion.div>

          {/* Square Card - LEFT */}
          <motion.div variants={item} className="md:col-span-6 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <Headphones className="w-8 h-8 text-indigo-400" />
            <div>
              <h3 className="text-xl font-medium text-white mb-2">Multimodal Synthesis</h3>
              <p className="text-slate-400 text-sm">Real-time podcast generation using Hugging Face Serverless Inference. Free, low-latency TTS streaming.</p>
            </div>
          </motion.div>

          {/* Square Card - RIGHT */}
          <motion.div variants={item} className="md:col-span-6 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <Sparkles className="w-8 h-8 text-indigo-400" />
            <div>
              <h3 className="text-xl font-medium text-white mb-2">Two-Stage Reranking</h3>
              <p className="text-slate-400 text-sm">Zero-Hallucination Retrieval. Gemini 2.5 Flash acts as a Cross-Encoder to verify context relevance before agent response.</p>
            </div>
          </motion.div>

          {/* Wide Card - BOTTOM */}
          <motion.div variants={item} className="md:col-span-12 rounded-xl bg-white/[0.03] border border-white/[0.08] p-8 flex flex-col justify-between hover:border-white/[0.15] hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] transition-all">
            <div className="flex items-center gap-4">
              <Zap className="w-8 h-8 text-indigo-400" />
              <div className="flex gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-mono text-indigo-400">1</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-mono text-indigo-400">2</span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-mono text-indigo-400">3</span>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-medium text-white mb-2">Agentic 5-Tool Toolkit</h3>
              <p className="text-slate-400 text-sm max-w-lg">Flashcards, Creator Script, Architectural Design, Action Item Extractor, and Twitter Thread formatter. Full pipeline execution in milliseconds.</p>
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
