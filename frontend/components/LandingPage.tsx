"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { toast } from "sonner";
import { 
  Brain, Network, Headphones, Sparkles, Zap, 
  ArrowRight, Upload, Play, Globe, Check, 
  RotateCcw, MessageSquare, Loader2
} from "lucide-react";

const SIMULATION_STEPS = [
  "Reading website DOM contents securely...",
  "Splitting document into 1000-character concept segments...",
  "Generating 768-dimension vectors using gemini-embedding-001...",
  "Running unsupervised L2 spherical KMeans clustering...",
  "Coordinating parallel LangGraph Synthesis Swarm nodes...",
  "Synthesizing Interactive Knowledge Graph!"
];

export default function LandingPage() {
  // Sandbox Simulator States
  const [sandboxState, setSandboxState] = useState<"idle" | "loading" | "complete">("idle");
  const [simulatedUrl, setSimulatedUrl] = useState("https://en.wikipedia.org/wiki/Machine_learning");
  const [loadingStep, setLoadingStep] = useState(0);
  const [activeTab, setActiveTab] = useState<"graph" | "chat">("graph");
  const [flippedCard, setFlippedCard] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    show: { 
      opacity: 1, 
      y: 0, 
      transition: { type: "spring", stiffness: 100, damping: 15 } 
    }
  };

  // Simulator Progress Loop
  useEffect(() => {
    if (sandboxState !== "loading") return;
    setLoadingStep(0);
    
    const interval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev >= SIMULATION_STEPS.length - 1) {
          clearInterval(interval);
          setTimeout(() => {
            setSandboxState("complete");
            toast.success("Simulation complete! Explore the sandbox workspace.", {
              description: "Interactive mock graph and chat now initialized.",
              duration: 4000
            });
          }, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [sandboxState]);

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    if (sandboxState === "loading") return;
    setSandboxState("loading");
    toast.info("Initializing Sandbox Workspace...", {
      description: "Booting mock FastAPI server and ML cluster loops."
    });
  };

  const resetSandbox = () => {
    setSandboxState("idle");
    setLoadingStep(0);
    setActiveTab("graph");
    setFlippedCard(false);
  };

  return (
    <div className="min-h-screen bg-[#06060a] text-[#e2e8f0] selection:bg-indigo-500/30 overflow-x-hidden relative font-sans">
      
      {/* 1. Ultra-Premium Radial Mesh Gradient Overlays */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-r from-[#7c3aed]/10 to-[#06b6d4]/10 rounded-full blur-[140px] pointer-events-none opacity-60" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-gradient-to-r from-indigo-500/10 to-[#3b82f6]/5 rounded-full blur-[160px] pointer-events-none opacity-40" />
      <div className="absolute bottom-10 left-10 w-[450px] h-[450px] bg-gradient-to-r from-[#06b6d4]/5 to-transparent rounded-full blur-[120px] pointer-events-none opacity-40" />

      {/* SVG Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* 2. Aesthetic Navigation Header */}
      <nav className="flex items-center justify-between px-6 md:px-16 py-6 relative z-30 border-b border-white/5 bg-[#06060a]/40 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#7c3aed]/25 to-[#06b6d4]/15 border border-white/[0.08] flex items-center justify-center glow-purple-sm shadow-inner">
            <Brain className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
            Acumen 
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-mono tracking-widest text-[#a78bfa] uppercase">
              Engine v2
            </span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <SignInButton mode="modal">
            <button className="text-xs font-mono uppercase tracking-[0.25em] text-[#a78bfa]/80 hover:text-white transition-all active:scale-95">
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="px-5 py-2.5 rounded-xl bg-indigo-600 border border-indigo-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-indigo-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.45)] transition-all active:scale-95">
              Get Started
            </button>
          </SignUpButton>
        </div>
      </nav>

      {/* 3. Hero & Sandbox Grid Layout */}
      <main className="max-w-7xl mx-auto px-6 py-12 md:py-20 relative z-20 space-y-24">
        
        {/* Hero Copy */}
        <section className="flex flex-col items-center text-center gap-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-mono uppercase tracking-[0.2em] text-[#a78bfa]">
            <Sparkles className="w-3 h-3 text-[#a78bfa] animate-pulse" />
            Parallel Synthesizer Swarm Deployed
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[0.9] text-white">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40">
              Turn Static Notes
            </span>
            <br />
            <span className="gradient-text">Into Interactive Intelligence.</span>
          </h1>

          <p className="text-slate-400 text-base md:text-lg max-w-2xl leading-relaxed">
            Acumen reorganizes complex PDFs, directories, and URLs into logical topic islands using unsupervised KMeans ML, then launches parallel LangGraph swarms to build a tactile **Knowledge Graph** and RAG-integrated **Action Studio**.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <SignUpButton mode="modal">
              <button className="px-8 py-4 rounded-2xl bg-indigo-600 border border-indigo-500 hover:bg-indigo-500 text-white font-bold text-sm uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:shadow-[0_0_40px_rgba(99,102,241,0.6)] hover:scale-[1.02] active:scale-95">
                Initialize Workspace
              </button>
            </SignUpButton>
            <a 
              href="#sandbox"
              className="px-8 py-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl text-white font-bold text-sm uppercase tracking-widest hover:bg-white/[0.06] hover:border-white/20 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              Test Sandbox <ArrowRight className="w-4 h-4 text-indigo-400" />
            </a>
          </div>
        </section>

        {/* 4. THE INTERACTIVE SANDBOX CONSOLE (WOW Factor centerpiece) */}
        <section id="sandbox" className="scroll-mt-24 max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <Zap className="w-5 h-5 text-indigo-400 fill-indigo-400" />
                Acumen Sandbox Terminal
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Tactile simulation of full machine learning ingest & RAG swarm.</p>
            </div>
            {sandboxState !== "idle" && (
              <button 
                onClick={resetSandbox}
                className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[#a78bfa] hover:text-white transition-colors self-end sm:self-auto bg-white/5 px-3 py-1.5 rounded-xl border border-white/5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset Simulator
              </button>
            )}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[#0c0d14]/70 backdrop-blur-xl shadow-[0_0_60px_rgba(124,58,237,0.1)] overflow-hidden min-h-[440px] flex flex-col relative">
            
            {/* Top Bar with window controls */}
            <div className="px-5 py-3.5 border-b border-white/5 bg-black/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="text-[10px] text-slate-600 font-mono ml-3 uppercase tracking-wider">sandbox-api-rehydration.sh</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Simulated Sandbox
              </div>
            </div>

            {/* Sandbox Inner Body */}
            <div className="flex-1 flex flex-col relative">
              <AnimatePresence mode="wait">
                
                {/* STATE A: IDLE — Ingest Input Form */}
                {sandboxState === "idle" && (
                  <motion.div 
                    key="sandbox-idle"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-8 gap-8"
                  >
                    <div className="text-center space-y-2 max-w-md">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto mb-2 glow-purple-sm">
                        <Upload className="w-5.5 h-5.5 text-indigo-400" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Paste URL to Synthesize Sandbox</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Input any web address below to trigger a mock synthesis. See the unsupervised KMeans and LangGraph coordinate maps build automatically.
                      </p>
                    </div>

                    <form onSubmit={handleSimulate} className="w-full max-w-lg flex flex-col sm:flex-row gap-2">
                      <div className="flex-1 relative group">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2">
                          <Globe className="w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                          type="url"
                          value={simulatedUrl}
                          onChange={(e) => setSimulatedUrl(e.target.value)}
                          placeholder="Paste a website url..."
                          required
                          className="w-full bg-white/5 border border-white/8 rounded-xl pl-11 pr-4 py-3.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-lg active:scale-95 shrink-0 flex items-center justify-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" /> Synthesize Demo
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* STATE B: LOADING — Synthesis checklist updates */}
                {sandboxState === "loading" && (
                  <motion.div 
                    key="sandbox-loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center p-8 gap-8"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center glow-purple-sm animate-pulse">
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                      </div>
                      <h3 className="text-sm font-bold text-white mt-1 uppercase tracking-widest font-mono">Running Ingestion Engine</h3>
                      <p className="text-[11px] text-slate-500 font-mono">Session ID: simulated-session-42</p>
                    </div>

                    {/* Step Checklists */}
                    <div className="w-full max-w-md bg-black/30 border border-white/5 rounded-2xl p-5 space-y-2.5 font-mono text-[11px] text-slate-400">
                      {SIMULATION_STEPS.map((step, idx) => {
                        const isDone = loadingStep > idx;
                        const isActive = loadingStep === idx;
                        return (
                          <div 
                            key={idx} 
                            className={`flex items-center gap-3 transition-colors duration-300 ${
                              isDone ? "text-emerald-400 font-bold" : isActive ? "text-indigo-400 font-bold" : "opacity-45"
                            }`}
                          >
                            {isDone ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : isActive ? (
                              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                            )}
                            <span>{step}</span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* STATE C: COMPLETE — Playable Interactive Mini Workspace */}
                {sandboxState === "complete" && (
                  <motion.div 
                    key="sandbox-complete"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col overflow-hidden"
                  >
                    {/* Secondary Navigation */}
                    <div className="px-5 py-2.5 border-b border-white/5 bg-black/20 flex items-center justify-between shrink-0">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveTab("graph")}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                            activeTab === "graph" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <Network className="w-3.5 h-3.5" /> Concept Graph
                        </button>
                        <button
                          onClick={() => setActiveTab("chat")}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                            activeTab === "chat" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> Action Agent Chat
                        </button>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">Source: simulated-wikipedia.org</span>
                    </div>

                    {/* Tab contents */}
                    <div className="flex-1 relative overflow-hidden bg-black/10">
                      
                      {/* GRAPH PANEL */}
                      {activeTab === "graph" && (
                        <div className="absolute inset-0 flex items-center justify-center p-6 select-none">
                          {/* Simulated Canvas with nodes */}
                          <div className="relative w-full h-full border border-dashed border-white/5 rounded-2xl overflow-hidden flex items-center justify-center bg-[#07070b]">
                            
                            {/* Dot grid */}
                            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1.5px,transparent_1.5px)] bg-[size:16px_16px] pointer-events-none" />

                            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-14">
                              {/* Node 1 */}
                              <div className="w-48 p-3.5 rounded-2xl bg-[#111118] border border-indigo-500/40 hover:border-indigo-400 text-center shadow-lg transition-transform hover:scale-105">
                                <span className="text-[9px] font-mono text-[#a78bfa] tracking-widest uppercase mb-1 block">Topic 0</span>
                                <h4 className="text-xs font-bold text-white leading-tight">Supervised Algorithms</h4>
                                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">Linear regression, vector machines, and classification metrics.</p>
                              </div>

                              {/* Connective lines */}
                              <div className="w-[1px] h-6 md:w-12 md:h-[2px] bg-indigo-500/40 shrink-0" />

                              {/* Node 2 */}
                              <div className="w-48 p-3.5 rounded-2xl bg-[#111118] border border-cyan-500/40 hover:border-cyan-400 text-center shadow-lg transition-transform hover:scale-105">
                                <span className="text-[9px] font-mono text-[#22d3ee] tracking-widest uppercase mb-1 block">Topic 1</span>
                                <h4 className="text-xs font-bold text-white leading-tight">Clustering Models</h4>
                                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">KMeans centroids, dimensional L2 sphere partitioning.</p>
                              </div>
                            </div>
                            
                            <span className="absolute bottom-3 left-3 text-[9px] text-slate-600 font-mono uppercase tracking-widest">Interactive Nodes Mockup</span>
                          </div>
                        </div>
                      )}

                      {/* CHAT & TOOL OUTPUT PANEL */}
                      {activeTab === "chat" && (
                        <div className="absolute inset-0 flex flex-col md:flex-row overflow-hidden">
                          {/* Chat feed left */}
                          <div className="flex-1 flex flex-col border-r border-white/5 overflow-y-auto p-4 gap-4 justify-end">
                            <div className="flex flex-col gap-1 items-end">
                              <p className="text-xs p-3 bg-white/[0.04] border border-white/10 rounded-2xl rounded-tr-sm text-slate-100 max-w-[90%]">
                                Generate flashcards so I can study this machine learning document.
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 items-start">
                              <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[#a78bfa] font-mono uppercase tracking-wider">
                                GENERATE FLASHCARDS
                              </span>
                              <p className="text-xs p-3 bg-white/[0.02] border border-white/5 rounded-2xl rounded-tl-sm text-slate-300 max-w-[90%] leading-relaxed">
                                I have synthesized the clustered data and generated a high-retention Anki study card deck. Click below to test your knowledge!
                              </p>
                            </div>
                          </div>

                          {/* Interactive Flashcard widget right */}
                          <div className="w-full md:w-80 shrink-0 bg-black/20 p-4 border-t md:border-t-0 md:border-l border-white/5 flex flex-col justify-center items-center gap-4">
                            <h4 className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-widest">Simulated Study Card</h4>
                            
                            {/* Flipping card */}
                            <div 
                              className={`flip-card w-full max-w-[240px] relative ${flippedCard ? "is-flipped" : ""}`}
                              style={{ height: "130px" }}
                              onClick={() => setFlippedCard(!flippedCard)}
                            >
                              <div className="flip-card-inner">
                                <div className="flip-card-front bg-[#111118] border border-indigo-500/30 flex flex-col justify-between p-4 shadow-lg rounded-2xl text-center">
                                  <span className="text-[8px] font-mono text-indigo-400">Front (Click to reveal)</span>
                                  <p className="text-xs font-bold text-white">What does KMeans use as clusters anchors?</p>
                                  <div className="h-1" />
                                </div>
                                <div className="flip-card-back bg-gradient-to-br from-[#120f21] to-[#0c0d14] border border-indigo-400/50 flex flex-col justify-between p-4 shadow-lg rounded-2xl text-center">
                                  <span className="text-[8px] font-mono text-emerald-400">Back</span>
                                  <p className="text-xs text-[#d8b4fe]">Centroids, which represent topic means of all associated coordinates.</p>
                                  <div className="h-1" />
                                </div>
                              </div>
                            </div>
                            
                            <span className="text-[9px] text-slate-600 font-mono uppercase tracking-wide">Interactive Flip Demo</span>
                          </div>
                        </div>
                      )}

                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* 5. Bento Grid Features Section */}
        <motion.section 
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[250px]"
        >
          {/* Card 1 - Parallel Swarm Summary */}
          <motion.div 
            variants={itemVariants} 
            className="md:col-span-12 rounded-[2.5rem] bg-gradient-to-br from-white/[0.02] to-transparent border border-white/5 hover:border-white/10 p-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group hover:shadow-[0_0_40px_rgba(124,58,237,0.06)] transition-all duration-300"
          >
            <div className="space-y-3 max-w-xl">
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-indigo-400/80 font-bold bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                Primary Module // KMeans Graph Swarms
              </span>
              <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Logical Topic Boundaries</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Standard RAG splits linear pages into rigid segments, breaking unified topics. Acumen embeds and groups them into 5 discrete topic clusters using unit-sphere vector distances, preserving linear semantics perfectly.
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 glow-purple-sm self-end md:self-auto group-hover:scale-105 transition-transform">
              <Network className="w-7 h-7 text-indigo-400" />
            </div>
          </motion.div>

          {/* Card 2 - Podcast Inference */}
          <motion.div 
            variants={itemVariants} 
            className="md:col-span-6 rounded-[2.5rem] bg-gradient-to-br from-white/[0.02] to-transparent border border-white/5 hover:border-white/10 p-8 flex flex-col justify-between group hover:shadow-[0_0_30px_rgba(99,102,241,0.04)] transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
              <Headphones className="w-5.5 h-5.5" />
            </div>
            <div className="space-y-2 mt-8">
              <h3 className="text-xl font-bold text-white tracking-tight">Audio Studio Overview</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Low-latency real-time text-to-speech engine compiles a professional 30-second dialog overview between Host A and Host B, with scrolling transcripts, volume sliders, and variable play rate controls.
              </p>
            </div>
          </motion.div>

          {/* Card 3 - Two-Stage RAG */}
          <motion.div 
            variants={itemVariants} 
            className="md:col-span-6 rounded-[2.5rem] bg-gradient-to-br from-white/[0.02] to-transparent border border-white/5 hover:border-white/10 p-8 flex flex-col justify-between group hover:shadow-[0_0_30px_rgba(99,102,241,0.04)] transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5.5 h-5.5" />
            </div>
            <div className="space-y-2 mt-8">
              <h3 className="text-xl font-bold text-white tracking-tight">Gemini Cross-Encoder Reranking</h3>
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                Zero-Hallucination Retrieval. ChromaDB vector retrieval candidates are run through an LLM Reranker step to evaluate deep semantic query relevance and weed out noisy references before compiling agent responses.
              </p>
            </div>
          </motion.div>

          {/* Card 4 - Agent Toolkit */}
          <motion.div 
            variants={itemVariants} 
            className="md:col-span-12 rounded-[2.5rem] bg-gradient-to-br from-white/[0.02] to-transparent border border-white/5 hover:border-white/10 p-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group hover:shadow-[0_0_40px_rgba(124,58,237,0.06)] transition-all duration-300"
          >
            <div className="space-y-3 max-w-xl">
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-indigo-400/80 font-bold bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                Action Prime Toolbelt // 5 Executable Formats
              </span>
              <h3 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Agentic Study Suite</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Unlock five executive tools immediately in chat: flip flashcards, architectural logic flows, checklist sprints, video creator scripts with a variable teleprompter, and Obsidian-compatible markdown notes.
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 glow-purple-sm self-end md:self-auto group-hover:scale-105 transition-transform">
              <Zap className="w-7 h-7 text-indigo-400" />
            </div>
          </motion.div>
        </motion.section>

      </main>

      {/* 6. Footer Section */}
      <footer className="border-t border-white/5 bg-[#030305] py-12 text-center text-xs text-slate-600 relative z-30 font-mono uppercase tracking-[0.2em] flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-500" />
          <span className="text-white font-bold">Acumen Studio</span>
        </div>
        <span>© 2026 Acumen Inc. All Rights Reserved. // Secured via AES-GCM.</span>
      </footer>

    </div>
  );
}
