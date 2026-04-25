import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0b",
        foreground: "#e1e1e3",
        surface: "rgba(255, 255, 255, 0.03)",
        "claude-border": "rgba(255, 255, 255, 0.08)",
        "claude-accent": {
          DEFAULT: "rgba(129, 140, 248, 0.8)", // indigo-400/80
        },
      },
      borderRadius: {
        xl: "12px",
      },
      letterSpacing: {
        "claude-meta": "0.2em",
      },
      boxShadow: {
        "claude-glow": "0 0 20px rgba(99, 102, 241, 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
