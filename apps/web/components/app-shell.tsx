import { Header } from "@/components/header";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-bg text-textMain">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-20 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-accent2/15 blur-3xl" />
      </div>
      <Header />
      <main className="relative mx-auto max-w-7xl px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
