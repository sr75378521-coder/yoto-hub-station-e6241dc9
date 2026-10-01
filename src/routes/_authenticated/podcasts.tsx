import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { PodcastImport } from "@/components/podcast/PodcastImport";

export const Route = createFileRoute("/_authenticated/podcasts")({
  head: () => ({
    meta: [
      { title: "Podcasts · Yoto Control Center" },
      { name: "description", content: "Search podcasts and download episodes as a ZIP." },
      { property: "og:title", content: "Podcasts · Yoto Control Center" },
      { property: "og:description", content: "Search podcasts and download episodes as a ZIP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell title="Podcasts">
      <div className="mx-auto max-w-4xl">
        <PodcastImport alwaysOpen />
      </div>
    </AppShell>
  ),
});
