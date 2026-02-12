"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/providers";

export function LoginClient() {
  const router = useRouter();
  const { login, register, loginWithGoogleToken } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState("New User");
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password123");
  const [googleToken, setGoogleToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      if (isRegister) {
        await register(fullName, email, password);
      } else {
        await login(email, password);
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitGoogle() {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogleToken(googleToken);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-borderGlass bg-card p-6 shadow-glow">
      <h1 className="font-display text-2xl">{isRegister ? "Create account" : "Welcome back"}</h1>
      <p className="mt-1 text-sm text-textMuted">Email/password and Google token login are supported.</p>

      <div className="mt-4 space-y-3">
        {isRegister && (
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
          />
        )}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          className="w-full rounded-xl border border-borderGlass bg-bgSoft px-3 py-2 text-sm"
        />
        <button onClick={submit} disabled={loading} className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black">
          {loading ? "Please wait..." : isRegister ? "Register" : "Login"}
        </button>
      </div>

      <button onClick={() => setIsRegister((state) => !state)} className="mt-3 text-xs text-textMuted hover:text-textMain">
        {isRegister ? "Already have an account? Login" : "No account? Register"}
      </button>

      <div className="mt-6 rounded-xl border border-borderGlass bg-bgSoft p-4">
        <h2 className="text-sm font-semibold">Google Login (Token)</h2>
        <p className="mt-1 text-xs text-textMuted">For production, connect Google Identity Services in frontend and post `credential` token here.</p>
        <input
          value={googleToken}
          onChange={(e) => setGoogleToken(e.target.value)}
          placeholder="Paste Google ID token"
          className="mt-2 w-full rounded-lg border border-borderGlass bg-card px-3 py-2 text-sm"
        />
        <button onClick={submitGoogle} disabled={loading || !googleToken} className="mt-2 rounded-lg border border-borderGlass px-3 py-2 text-sm text-textMain">
          Continue with Google token
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>}
    </div>
  );
}
