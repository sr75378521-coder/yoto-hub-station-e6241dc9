import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PlaylistComments({
  playlistId,
  userId,
  email,
  canPost,
}: {
  playlistId: string;
  userId: string;
  email?: string | null;
  canPost: boolean;
}) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = ["playlist-comments", playlistId];
  const comments = useQuery({
    queryKey: key,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("playlist_comments")
        .select("*")
        .eq("playlist_id", playlistId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  async function post() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from("playlist_comments")
      .insert({
        playlist_id: playlistId,
        user_id: userId,
        body: text.slice(0, 1000),
        author_name: (email ?? "Member").split("@")[0],
      });
    setBusy(false);
    if (error) {
      setError("Could not post your comment.");
      return;
    }
    setBody("");
    await cache.invalidateQueries({ queryKey: key });
  }
  async function remove(id: string) {
    await supabase.from("playlist_comments").delete().eq("id", id);
    await cache.invalidateQueries({ queryKey: key });
  }
  return (
    <div className="mt-3 border-t pt-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <MessageSquare className="size-4" />
        {open ? "Hide comments" : "Comments"}
      </Button>
      {open && (
        <div className="mt-2 space-y-2">
          {comments.data?.map((c) => (
            <div key={c.id} className="rounded-md bg-muted p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{c.author_name}</span>
                {c.user_id === userId && (
                  <button aria-label="Delete comment" onClick={() => void remove(c.id)}>
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}
          {comments.data && !comments.data.length && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
          {canPost && (
            <>
              <Textarea
                aria-label="Write a comment"
                placeholder="Write a comment…"
                value={body}
                maxLength={1000}
                onChange={(e) => setBody(e.target.value)}
              />
              <Button size="sm" disabled={busy || !body.trim()} onClick={() => void post()}>
                Post comment
              </Button>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
