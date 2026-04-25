# Claude Design System: "Deep Work" Aesthetic

This document outlines the architectural and aesthetic rules for the Acumen platform. All future components and style updates must adhere to these standards to ensure a premium, focused user experience.

## 1. The Canvas (The Space)
- **Primary Background**: Strict `bg-[#0a0a0b]`. This creates a deep, focused workspace.
- **Primary Foreground**: `text-[#e1e1e3]`. High legibility with reduced eye strain.
- **Layout Architecture**: 
  - Utilize "Side-by-Side" split views (Artifact-style) for major feature areas.
  - Consistent 24px (p-6) or 32px (p-8) padding for main containers.

## 2. Component Language (The Materials)
- **Glassmorphism**: 
  - Backgrounds: `bg-white/[0.03]`
  - Effects: `backdrop-blur-xl`
- **Borders**: Ultra-thin `border-white/[0.08]`. Avoid heavy shadows; use border contrast instead.
- **Corner Radius**: Standardized `rounded-xl` (12px) for cards and modals. `rounded-full` for badges.

## 3. Typography (The Voice)
- **Base Font**: Inter or Geist (Sans-serif) for body text and primary UI.
- **Accent/Metadata**: 
  - Style: `font-mono text-xs uppercase tracking-[0.2em]`
  - Color: `text-indigo-400/80`
  - Usage: Badges, status labels, timestamps, and metadata.
- **Headlines**: `font-medium tracking-tight text-white`.

## 4. Visual Feedback (The Interaction)
- **Hover States**: 
  - Border transition: `border-white/[0.15]`
  - Shadow: `shadow-[0_0_20px_rgba(99,102,241,0.1)]`
- **Animations**: 
  - Tool: Framer Motion
  - Style: "Springy" entrances (stiffness: 260, damping: 20).
  - Sequence: Staggered children for all list/grid rendering.

## 5. Color Palette (Tailwind Tokens)
- **Canvas**: `#0a0a0b`
- **Surface**: `rgba(255, 255, 255, 0.03)`
- **Border**: `rgba(255, 255, 255, 0.08)`
- **Accent (Indigo)**: `rgba(129, 140, 248, 0.8)` (indigo-400 equivalent)
- **Text (Muted)**: `#94a3b8` (slate-400)
- **Text (Bright)**: `#e1e1e3`
