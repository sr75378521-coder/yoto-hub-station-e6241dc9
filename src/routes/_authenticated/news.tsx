import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Newspaper,
  Pin,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  Sparkles,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import type { Database } from "@/integrations/supabase/types";

type NewsPost = Database["public"]["Tables"]["news_posts"]["Row"];

export const Route = createFileRoute("/_authenticated/news")({
  head: () => ({
    meta: [
      { title: "News & Updates · Yoto Control Center" },
      {
        name: "description",
        content: "Latest updates, announcements, and new features in Yoto Control Center.",
      },
      { property: "og:title", content: "News & Updates · Yoto Control Center" },
      {
        property: "og:description",
        content: "Latest updates and new features.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsPage,
});

function NewsPage() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<NewsPost | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["news_posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_posts")
        .select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as NewsPost[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      setError("");
      if (!title.trim() || !body.trim()) {
        throw new Error("Title and body cannot be empty.");
      }

      if (editingPost) {
        const { error } = await supabase
          .from("news_posts")
          .update({
            title: title.trim(),
            body: body.trim(),
            pinned,
          })
          .eq("id", editingPost.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("news_posts").insert({
          title: title.trim(),
          body: body.trim(),
          pinned,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news_posts"] });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      setError(err.message || "Failed to save post.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("news_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news_posts"] });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from("news_posts")
        .update({ pinned: !pinned })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news_posts"] });
    },
  });

  function resetForm() {
    setEditingPost(null);
    setTitle("");
    setBody("");
    setPinned(false);
    setError("");
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(post: NewsPost) {
    setEditingPost(post);
    setTitle(post.title);
    setBody(post.body);
    setPinned(post.pinned);
    setError("");
    setDialogOpen(true);
  }

  return (
    <AppShell title="News & Updates">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 font-display text-3xl font-bold">
              <Newspaper className="size-8 text-primary" />
              News & Updates
            </h1>
            <p className="mt-1 text-muted-foreground">
              Announcements, new features, and changelogs for Yoto Control Center
            </p>
          </div>

          {isAdmin && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" />
              New Announcement
            </Button>
          )}
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Loading updates…
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 p-12 text-center">
            <Sparkles className="size-10 text-muted-foreground/60" />
            <h3 className="mt-4 font-display text-lg font-semibold">No announcements yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {isAdmin
                ? "Click 'New Announcement' above to publish the first update for your users."
                : "Check back soon for new updates and announcements."}
            </p>
            {isAdmin && (
              <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                <Plus className="size-4" />
                Post first update
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <article
                key={post.id}
                className={`relative rounded-xl border bg-card p-6 shadow-sm transition ${
                  post.pinned ? "border-primary/40 bg-primary/[0.02]" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.pinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          <Pin className="size-3" />
                          Pinned
                        </span>
                      )}
                      <h2 className="font-display text-xl font-bold leading-tight">
                        {post.title}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="size-3.5" />
                      <time dateTime={post.created_at}>
                        {new Date(post.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          togglePinMutation.mutate({ id: post.id, pinned: post.pinned })
                        }
                        title={post.pinned ? "Unpin post" : "Pin post to top"}
                        className="h-8 px-2 text-xs"
                      >
                        <Pin className={`size-3.5 ${post.pinned ? "text-primary fill-primary" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(post)}
                        title="Edit post"
                        className="h-8 px-2 text-xs"
                      >
                        <Edit3 className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this announcement?")) {
                            deleteMutation.mutate(post.id);
                          }
                        }}
                        title="Delete post"
                        className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {post.body}
                </div>
              </article>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingPost ? "Edit Announcement" : "New Announcement"}
              </DialogTitle>
              <DialogDescription>
                Publish news, feature updates, and tips visible to all signed-in users.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
              className="space-y-4"
            >
              {error && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. AI Yoto can now draw icons"
                  maxLength={160}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Message Body</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Share details about what's new..."
                  rows={6}
                  maxLength={10000}
                  required
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                Pin this post to the top of the feed
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Saving…
                    </>
                  ) : editingPost ? (
                    "Save Changes"
                  ) : (
                    "Publish Announcement"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
