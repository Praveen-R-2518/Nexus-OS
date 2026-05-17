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
          'page':     '#F5F3EF',
          'card':     '#FAFAF8',
          'elevated': '#FFFFFF',
          'sidebar':  '#F0EDE8',
          'input':    '#F7F6F2',
        },
        light: {
          'text-primary': '#1A1A1A',
          'text-secondary': '#5C5C5C',
          'text-tertiary': '#8A8A8A',
          'text-positive': '#1B6B3A',
          'text-warning': '#7A4200',
          'text-critical': '#8B1A1A',
          'text-nav': '#2E2E2E',
        }
      },
      letterSpacing: {
        tightest: "-0.02em",
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
