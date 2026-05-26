import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta-sans)", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        obsidian: "var(--obsidian)",
        "trajectory-blue": "var(--trajectory-blue)",
        "atmospheric-grey": "var(--atmospheric-grey)",
        surface: {
          page: "var(--surface-page)",
          card: "var(--surface-card)",
          elevated: "var(--surface-elevated)",
          sidebar: "var(--surface-sidebar)",
          input: "var(--surface-input)",
          muted: "var(--surface-muted)",
        },
        border: {
          DEFAULT: "var(--border-subtle)",
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
          active: "var(--trajectory-blue)",
        },
        /* Semantic status tokens (pair with bg- / border- / text-) */
        status: {
          positive: "var(--status-positive-fg)",
          "positive-surface": "var(--status-positive-surface)",
          "positive-border": "var(--status-positive-border)",
          neutral: "var(--status-neutral-fg)",
          "neutral-surface": "var(--status-neutral-surface)",
          "neutral-border": "var(--status-neutral-border)",
          warning: "var(--status-warning-fg)",
          "warning-surface": "var(--status-warning-surface)",
          "warning-border": "var(--status-warning-border)",
          caution: "var(--status-caution-fg)",
          "caution-surface": "var(--status-caution-surface)",
          "caution-border": "var(--status-caution-border)",
          critical: "var(--status-critical-fg)",
          "critical-surface": "var(--status-critical-surface)",
          "critical-border": "var(--status-critical-border)",
        },
        badge: {
          "pending-bg": "#fdf3e3",
          "pending-text": "#5a3800",
          "pending-ring": "#d4a855",
          "high-bg": "#fdf0e3",
          "high-text": "#5a2e00",
          "high-ring": "#c47a2a",
          "critical-bg": "#fdeaea",
          "critical-text": "#6b1a1a",
          "critical-ring": "#c04040",
          "low-bg": "#eaf3de",
          "low-text": "#2a5010",
          "low-ring": "#7aae4a",
          "medium-bg": "#eef0f5",
          "medium-text": "#2a3850",
          "medium-ring": "#8090b0",
        },
        light: {
          "text-primary": "var(--text-primary)",
          "text-secondary": "var(--text-secondary)",
          "text-tertiary": "var(--text-tertiary)",
          "text-positive": "var(--status-positive-fg)",
          "text-warning": "var(--status-warning-fg)",
          "text-critical": "var(--status-critical-fg)",
          "text-nav": "#2e2e2e",
        },
      },
      boxShadow: {
        "glow-positive": "0 0 40px -8px var(--status-positive-glow)",
        "glow-critical": "0 0 36px -10px var(--status-critical-glow)",
        "card-halo": "0 12px 40px -12px rgba(0, 0, 0, 0.25)",
        "card-halo-light": "0 10px 30px -8px rgba(20, 24, 31, 0.08)",
      },
      letterSpacing: {
        tightest: "-0.02em",
        brand: "0.18em",
      },
      transitionDuration: {
        interaction: "200ms",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDownRow: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.92)" },
        },
      },
      animation: {
        "fade-up": "fadeUp 0.55s ease-out both",
        "slide-down-row": "slideDownRow 0.45s ease-out both",
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
