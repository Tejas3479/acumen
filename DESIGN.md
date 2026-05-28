# Acumen Design System: "Cosmic Glass" Aesthetic

This document outlines the architectural and aesthetic standards for the Acumen platform. All future components, views, and style updates must strictly adhere to these guidelines to maintain a premium, immersive, state-of-the-art user experience.

---

## 🌌 1. The Canvas Backdrop (Depth & Texture)

Rather than flat, dull background layers, the Acumen workspace utilizes a highly textured, dimensional universe style:

*   **Primary Background Color**: Strict, deep space black `bg-[#06060a]`.
*   **Ambient Cosmic Glows**: Embedded 3-layered slow-pulsing radial mesh gradients floating in the background:
    *   Top-Left: `#7c3aed` (purple-600) with a `blur-[140px]` at `60%` opacity.
    *   Center-Right: `indigo-500` with a `blur-[160px]` at `40%` opacity.
    *   Bottom-Left: `#06b6d4` (cyan-500) with a `blur-[120px]` at `40%` opacity.
*   **Tactile Dot Grid Mask**: A fine, repeating `4rem_4rem` grid layer masked with a radial gradient:
    ```css
    background-image: linear-gradient(to right, rgba(255,255,255,0.015) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(255,255,255,0.015) 1px, transparent 1px);
    mask-image: radial-gradient(ellipse 60% 50% at 50% 40%, #000 70%, transparent 100%);
    ```

---

## 🧊 2. Translucent Glassmorphic Cards (The Materials)

Workspace panels and overlays are designed as translucent glass plates floating over the cosmic backdrop:

*   **Panel Transparency**:
    *   Left Panel (Graph & Studio): `rgba(17, 17, 24, 0.55)`
    *   Right Panel (Chat & Podcast): `rgba(10, 10, 15, 0.45)`
    *   Header bar: `rgba(10, 10, 15, 0.45)`
*   **Backdrop Blur**: Strict `backdrop-blur-[20px]` or `backdrop-blur-[24px]` applied to all primary panels, allowing the pulsing gradient glows to filter through beautifully.
*   **Card Outlines**: Ultra-thin `border border-white/8` (or `border-white/5`). Contrasts structural panels without heavy shadows.
*   **Corner Radii**:
    *   Primary split panels: `rounded-none` to anchor onto screen bounds cleanly.
    *   Dialogue bubbles, study flip-cards, modals: `rounded-2xl` (16px) or `rounded-3xl` (24px) for premium soft organic feel.

---

## 🎨 3. Rich Color Palettes & HSL Glow Tokens

Avoid generic solid hues. Use curated, vibrant gradient overlays and shadow blooms:

*   **Primary Purple**: `#7c3aed` (slate-600 equivalent: `#4f46e5`).
*   **Cyan Accent**: `#06b6d4`.
*   **Emerald Success**: `#10b981`.
*   **Amber Warning/Mic**: `#f59e0b`.
*   **Muted slate**: `#64748b` (slate-500) and `#475569` (slate-600).
*   **Vibrant Gradient Text**: `linear-gradient(135deg, #a78bfa 0%, #38bdf8 100%)`.
*   **HSL Shadow Blooms**:
    *   Purple Bloom: `box-shadow: 0 0 20px rgba(124, 58, 237, 0.35)`.
    *   Emerald Bloom: `box-shadow: 0 0 20px rgba(16, 185, 129, 0.25)`.
    *   Amber Bloom: `box-shadow: 0 0 20px rgba(245, 158, 11, 0.25)`.

---

## 💬 4. Dialogue Flow & Bubble Aesthetics

The chat interface represents the master brain of the workspace, requiring stellar styling:

*   **User Message Bubbles**: Styled with a highly vibrant HSL glass gradient:
    *   Class: `bg-gradient-to-tr from-[#7c3aed]/15 to-[#4f46e5]/10 text-white border border-[#7c3aed]/30 shadow-[0_0_15px_rgba(124,58,237,0.08)]`
*   **Agent Message Bubbles**: Framed in crisp dark translucent plates:
    *   Class: `bg-[#111118]/85 backdrop-blur-md text-slate-200 border border-white/8 shadow-[0_0_20px_rgba(0,0,0,0.15)]`
*   **Typing/Thinking State**: Displays a clean glass container matching the agent bubble style, populated with three slow-pulsing dots using staggering animation delays (`animation-delay: 0.2s/0.4s`).

---

## ⚡ 5. Micro-Animations & Springs

Every interactive element must feel alive:

*   **Spring Parameters**: Springy entrances using Framer Motion:
    *   Entrance style: `stiffness: 100`, `damping: 15` to give a premium, organic drift.
*   **Hover Scaling**: Subtle visual expansions on hover:
    *   Dialogue bubbles, flashcards: `scale-[1.005]` or `scale-[1.02]`.
    *   Interactive buttons: `active:scale-[0.97]` for responsive physical feedback.
*   **Transition Speeds**: Standard hover transitions must utilize a clean `transition-all duration-300 ease-out` timing curve.

---

## 🌌 6. WebGL 3D Physical Space & Layout Presets

To fully immerse the user in their data, the interface bridges 3D graphics pipelines with standard 2D layout managers:

*   **Three.js Glass Node Material**: Nodes are rendered inside an interactive WebGL point cloud using:
    ```typescript
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(baseColor),
      transparent: true,
      opacity: active ? 0.82 : 0.08,
      roughness: 0.15,
      metalness: 0.1,
      transmission: active ? 0.88 : 0.2, // Refractive glass transparency
      thickness: active ? 2.5 : 0.2,     // Refracted light thickness
      clearcoat: active ? 1.0 : 0.0,
      clearcoatRoughness: 0.1,
    })
    ```
*   **Active Camera Drifts**: Continuously rotates the spatial point cloud using smooth trigonometric drifts (`x: distance * Math.sin(angle), z: distance * Math.cos(angle)`) to keep the interface visually dynamic and alive.
*   **Layout Preset Panel Resizes**: Resizes split panes using the smooth transitions of `react-resizable-panels`:
    *   **Galaxy Mode**: Expands left WebGL graph container to 90% width, collapsing chat and focusing entirely on 3D conceptual space exploration.
    *   **Auditor Mode**: Standard split panel providing a 58%/42% workspace split.
    *   **Studio Mode**: Focuses on the generated artifacts studio for focused synthesis readings.
