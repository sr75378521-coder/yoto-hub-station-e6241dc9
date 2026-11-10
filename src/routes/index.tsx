import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Radio, ListMusic, Users, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yoto Control Center — Manage every Yoto player" },
      {
        name: "description",
        content:
          "A modern dashboard for every Yoto player, playlist, and MYO card. Real-time controls, family view, and MYO playlist editing.",
      },
      { property: "og:title", content: "Yoto Control Center — Manage every Yoto player" },
      {
        property: "og:description",
        content:
          "A modern dashboard for every Yoto player, playlist, and MYO card. Real-time controls, family view, and MYO playlist editing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const cta = () => {
    if (signedIn) navigate({ to: "/dashboard" });
    else navigate({ to: "/auth" });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground flex flex-col justify-between">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "var(--gradient-hero)" }}
      />
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Radio className="size-5" />
          </div>
          <span className="font-semibold tracking-tight">Yoto Control Center</span>
        </div>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                Open dashboard
              </Button>
            </Link>
          ) : (
            <Link to="/auth">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-16 md:pt-28 flex-1">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="size-3" /> Early access · v0.1
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
            Every Yoto player,
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              in one calm dashboard.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            Control playback, edit MYO playlists, manage your family, and browse every card — from
            your browser, on any device.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={cta}>
              {signedIn ? "Open dashboard" : "Get started"}
            </Button>
            <a
              href="https://yotoplay.com"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Not affiliated with Yoto
            </a>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-4xl gap-4 md:grid-cols-3">
          {[
            {
              icon: Radio,
              title: "Live player control",
              body: "Real-time playback, volume, sleep timer and shuffle across every player.",
            },
            {
              icon: ListMusic,
              title: "MYO playlist editor",
              body: "Reorder chapters and tracks, replace artwork, upload MP3/M4A/WAV.",
            },
            {
              icon: Users,
              title: "Family view",
              body: "See who's listening to what, jump into any player, and manage permissions.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Icon className="size-4" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        <p>Made with 😁 by Spencer R and Jordan B</p>
      </footer>
    </div>
  );
}
