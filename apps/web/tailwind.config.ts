import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        bgSoft: "var(--bg-soft)",
        card: "var(--card)",
        cardHover: "var(--card-hover)",
        textMain: "var(--text-main)",
        textMuted: "var(--text-muted)",
        accent: "var(--accent)",
        accent2: "var(--accent-2)",
        borderGlass: "var(--border-glass)",
        success: "#16a34a",
        warning: "#eab308",
        danger: "#ef4444"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.08), 0 18px 50px rgba(0,0,0,0.45)"
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.65" }
        }
      },
      animation: {
        rise: "rise 0.45s ease-out both",
        pulseSoft: "pulseSoft 5s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
