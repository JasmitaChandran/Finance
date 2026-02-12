"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { AppMode, User } from "@/lib/types";

type Theme = "dark" | "light";
type Language = "en" | "es";

interface UIContextValue {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (language: Language) => void;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  loginWithGoogleToken: (idToken: string) => Promise<void>;
  logout: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);
const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "lumina_token";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode>("beginner");
  const [theme, setTheme] = useState<Theme>("dark");
  const [language, setLanguage] = useState<Language>("en");

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) {
      setLoading(false);
      return;
    }

    setToken(savedToken);
    api
      .me(savedToken)
      .then((me) => setUser(me))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      login: async (email, password) => {
        const response = await api.login(email, password);
        localStorage.setItem(TOKEN_KEY, response.access_token);
        setToken(response.access_token);
        const me = await api.me(response.access_token);
        setUser(me);
      },
      register: async (name, email, password) => {
        const response = await api.register(name, email, password);
        localStorage.setItem(TOKEN_KEY, response.access_token);
        setToken(response.access_token);
        const me = await api.me(response.access_token);
        setUser(me);
      },
      loginWithGoogleToken: async (idToken) => {
        const response = await api.googleLogin(idToken);
        localStorage.setItem(TOKEN_KEY, response.access_token);
        setToken(response.access_token);
        const me = await api.me(response.access_token);
        setUser(me);
      },
      logout: () => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    }),
    [token, user, loading]
  );

  const uiValue = useMemo(
    () => ({
      mode,
      setMode,
      theme,
      setTheme,
      language,
      setLanguage
    }),
    [mode, theme, language]
  );

  return (
    <UIContext.Provider value={uiValue}>
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    </UIContext.Provider>
  );
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used inside AppProviders");
  return context;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AppProviders");
  return context;
}
