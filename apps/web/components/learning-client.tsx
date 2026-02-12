"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

export function LearningClient() {
  const [lessons, setLessons] = useState<Array<{ id: string; title: string; level: string; duration_minutes: number; summary: string }>>([]);
  const [question, setQuestion] = useState("What is a good diversification strategy for beginners?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.lessons().then((response) => setLessons(response.items)).catch(() => setLessons([]));
  }, []);

  async function askTutor() {
    setLoading(true);
    try {
      const response = await api.tutor(question);
      setAnswer(response.answer);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5 animate-rise">
      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h1 className="font-display text-2xl">Learning Hub</h1>
        <p className="mt-2 text-sm text-textMuted">Financial literacy first: short lessons, plain language, and AI tutor support.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lessons.map((lesson) => (
          <article key={lesson.id} className="rounded-2xl border border-borderGlass bg-card p-4 shadow-glow">
            <p className="text-xs uppercase tracking-wide text-accent">{lesson.level}</p>
            <h3 className="mt-2 font-display text-lg">{lesson.title}</h3>
            <p className="mt-2 text-sm text-textMuted">{lesson.summary}</p>
            <p className="mt-3 text-xs text-textMuted">{lesson.duration_minutes} minutes</p>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-borderGlass bg-card p-5 shadow-glow">
        <h2 className="font-display text-lg">AI Finance Tutor</h2>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm" />
          <button onClick={askTutor} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black">
            {loading ? "Thinking..." : "Ask Tutor"}
          </button>
        </div>
        {answer && <div className="mt-4 rounded-xl border border-borderGlass bg-bgSoft p-4 text-sm text-textMuted">{answer}</div>}
      </div>
    </section>
  );
}
