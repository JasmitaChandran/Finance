"use client";

import Link from "next/link";
import { ExternalLink, Newspaper } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { NewsArticle, NewsSummary } from "@/lib/types";

function formatPublished(value?: string) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

export function NewsPageClient() {
  const searchParams = useSearchParams();
  const initialSymbol = (searchParams.get("symbol") || "AAPL").trim().toUpperCase();

  const [symbol, setSymbol] = useState(initialSymbol);
  const [query, setQuery] = useState(initialSymbol);
  const [summary, setSummary] = useState<NewsSummary | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanedBullets = useMemo(
    () => (summary?.bullets ?? []).map((item) => item.trim()).filter(Boolean),
    [summary]
  );

  async function loadNews(stockSymbol: string) {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, itemsRes] = await Promise.all([api.getNewsSummary(stockSymbol), api.getNewsItems(stockSymbol)]);
      setSummary(summaryRes);
      setArticles(itemsRes.items || []);
      setSymbol(stockSymbol);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load news");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNews(initialSymbol);
  }, [initialSymbol]);

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl">News Center</h1>
            <p className="mt-1 text-sm text-textMuted">Click any card to open full article source.</p>
          </div>
          <Link href="/" className="rounded-lg border border-borderGlass px-3 py-2 text-xs text-textMuted hover:text-textMain">
            Back to Dashboard
          </Link>
        </div>

        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = query.trim().toUpperCase();
            if (!next) return;
            loadNews(next);
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.toUpperCase())}
            className="min-w-[200px] flex-1 rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
            placeholder="AAPL"
          />
          <button className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black">Load News</button>
        </form>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-card p-4 text-sm text-danger">{error}</div>}

      {loading && <div className="rounded-xl border border-borderGlass bg-card p-4 text-sm text-textMuted">Loading news for {symbol}...</div>}

      {!loading && !error && (
        <>
          <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
            <h2 className="font-display text-lg">AI Summary ({symbol})</h2>
            {summary ? (
              <>
                <p className="mt-2 text-sm text-textMuted">
                  Sentiment: <span className="text-textMain">{summary.sentiment}</span> ({summary.source_count} sources)
                </p>
                <ul className="mt-3 space-y-2 text-sm text-textMuted">
                  {cleanedBullets.map((bullet) => (
                    <li key={bullet} className="rounded-lg border border-borderGlass bg-bgSoft p-3">
                      • {bullet}
                    </li>
                  ))}
                  {!cleanedBullets.length && <li className="rounded-lg border border-borderGlass bg-bgSoft p-3">No summary points available.</li>}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-textMuted">No summary available.</p>
            )}
          </div>

          <div className="grid gap-3">
            {articles.map((article, idx) => (
              <a
                key={`${article.link || article.title}-${idx}`}
                href={article.link || "#"}
                target={article.link ? "_blank" : undefined}
                rel={article.link ? "noreferrer" : undefined}
                className="rounded-xl border border-borderGlass bg-card p-4 shadow-glow transition hover:border-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-textMain">{article.title || "Untitled news item"}</p>
                    <p className="mt-1 text-xs text-textMuted">
                      {article.publisher || "Unknown publisher"} • {formatPublished(article.published)}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-textMuted" />
                </div>
                {article.summary && <p className="mt-2 text-sm text-textMuted">{article.summary}</p>}
              </a>
            ))}

            {!articles.length && (
              <div className="rounded-xl border border-borderGlass bg-card p-6 text-sm text-textMuted">
                <Newspaper className="mr-2 inline h-4 w-4" />
                No articles available for {symbol} right now.
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
