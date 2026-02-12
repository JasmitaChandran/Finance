"use client";

import Link from "next/link";
import { LineChart, LogIn, MoonStar, Sparkles, SunMedium, UserRound } from "lucide-react";

import { useAuth, useUI } from "@/components/providers";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/news", label: "News" },
  { href: "/screener", label: "Screener" },
  { href: "/compare", label: "Compare" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/alerts", label: "Alerts" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/learning", label: "Learning" }
];

export function Header() {
  const { mode, setMode, theme, setTheme } = useUI();
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-borderGlass bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full min-w-max items-center justify-between gap-4 overflow-x-auto px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="rounded-xl border border-borderGlass bg-card p-2 shadow-glow">
            <LineChart className="h-5 w-5 text-accent" />
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-textMain">Lumina</div>
            <div className="text-xs text-textMuted">AI stock insights for everyone</div>
          </div>
        </Link>

        <nav className="flex items-center gap-2 whitespace-nowrap text-sm">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-textMuted transition hover:bg-card hover:text-textMain">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 whitespace-nowrap">
          <button
            onClick={() => setMode(mode === "beginner" ? "pro" : "beginner")}
            className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-xs text-textMain transition hover:bg-cardHover"
            aria-label="Toggle Beginner/Pro mode"
          >
            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
            {mode === "beginner" ? "Beginner" : "Pro"}
          </button>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg border border-borderGlass bg-card p-2 text-textMain transition hover:bg-cardHover"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
          </button>

          {user ? (
            <button
              onClick={logout}
              className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-xs text-textMain transition hover:bg-cardHover"
            >
              <UserRound className="mr-1 inline h-3.5 w-3.5" />
              {user.full_name.split(" ")[0]} (Logout)
            </button>
          ) : (
            <Link href="/login" className="rounded-lg border border-borderGlass bg-card px-3 py-2 text-xs text-textMain transition hover:bg-cardHover">
              <LogIn className="mr-1 inline h-3.5 w-3.5" />
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
