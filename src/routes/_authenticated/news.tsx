import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessagesSquare,
  Pin,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  Sparkles,
  Loader2,
  Clock,
  MessageCircle,
  Send,
  User,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";

interface PostItem {
  id: string;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  status: string;
  pinned: boolean;
  created_at: string;
}

interface CommentItem {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  author_avatar: string | null;
  body: string;
  created_at: string;
}

export const Route = createFileRoute("/_authenticated/news")({
  head: () => ({
    meta: [
      { title: "Community · Yoto Control Center" },
      {
        name: "description",
        content: "Community discussions, tips, and feature announcements.",
      },
    ],
  }),
  component: CommunityPage,
});

function CommunityPage() {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");

  // Profile modal state
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState("");

  // Track expanded comments per post
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  // 1. Get current user
  const { data: user } = useQuery({
    queryKey: ["current-user-auth"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  // 2. Fetch posts (approved + user's own pending)
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["community-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_posts")
        .select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as PostItem[];
    },
  });

  // 3. Save post mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const authorName =
        user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Yoto Family";
      const authorAvatar = user?.user_metadata?.avatar_url || null;

      if (editingPost) {
        const { error } = await supabase
          .from("news_posts")
          .update({
            title: title.trim(),
            body: body.trim(),
            pinned: isAdmin ? pinned : false,
          })
          .eq("id", editingPost.id);
        if (error) throw error;
      } else {
        const initialStatus = isAdmin ? "approved" : "pending";
        const { error } = await (supabase.from("news_posts") as any).insert({
          title: title.trim(),
          body: body.trim(),
          pinned: isAdmin ? pinned : false,
          status: initialStatus,
          author_name: authorName,
          author_avatar: authorAvatar,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      setDialogOpen(false);
      resetForm();
      toast.success(
        isAdmin
          ? "Post published!"
          : "Your post was submitted and is pending review by a moderator!",
      );
    },
    onError: (err: any) => {
      setError(err.message || "Failed to save post");
    },
  });

  // 4. Delete post mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("news_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-posts"] });
      toast.success("Post removed");
    },
  });

  // 5. Update user profile
  const profileMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: profileName.trim(),
          avatar_url: profileAvatar.trim(),
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["current-user-auth"] });
      setProfileOpen(false);
      toast.success("Profile updated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Could not update profile");
    },
  });

  const resetForm = () => {
    setTitle("");
    setBody("");
    setPinned(false);
    setEditingPost(null);
    setError("");
  };

  const handleEdit = (post: PostItem) => {
    setEditingPost(post);
    setTitle(post.title);
    setBody(post.body);
    setPinned(post.pinned);
    setDialogOpen(true);
  };

  const currentDisplayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const currentAvatar = user?.user_metadata?.avatar_url || "";

  return (
    <AppShell title="Community">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-primary/20 bg-card/60 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="relative">
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt={currentDisplayName}
                  className="size-14 rounded-full object-cover border-2 border-primary/30"
                />
              ) : (
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg border-2 border-primary/20">
                  {currentDisplayName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{currentDisplayName}</h2>
                {isAdmin && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <ShieldCheck className="size-3 text-primary" /> Admin
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Share questions, tips, card ideas, and feedback with other Yoto families.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProfileName(currentDisplayName);
                setProfileAvatar(currentAvatar);
                setProfileOpen(true);
              }}
            >
              <User className="size-4 mr-1.5" /> Edit Profile
            </Button>

            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="gap-1.5 shadow-sm"
            >
              <Plus className="size-4" /> New Post
            </Button>
          </div>
        </div>

        {/* Posts List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="mt-3 text-sm">Loading community posts...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card/30 p-12 text-center">
            <MessagesSquare className="mx-auto size-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-semibold">No discussions yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              Be the first to share a question, idea, or favorite card combination!
            </p>
            <Button
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="mt-6 gap-2"
            >
              <Plus className="size-4" /> Start First Discussion
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const isOwner = user?.id === post.author_id;
              const isPending = post.status === "pending";

              return (
                <div
                  key={post.id}
                  className={`rounded-2xl border transition-all p-5 ${
                    post.pinned
                      ? "border-primary/40 bg-primary/[0.03] shadow-sm"
                      : "border-border/70 bg-card/50"
                  }`}
                >
                  {/* Status / Pinned Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      {/* Author Avatar */}
                      {post.author_avatar ? (
                        <img
                          src={post.author_avatar}
                          alt={post.author_name}
                          className="size-8 rounded-full object-cover border border-border"
                        />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
                          {(post.author_name || "M").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-semibold">{post.author_name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar className="size-3" />
                          {new Date(post.created_at).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isPending && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1 text-xs"
                        >
                          <Clock className="size-3" /> Pending Review
                        </Badge>
                      )}
                      {post.pinned && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Pin className="size-3 text-primary" /> Pinned
                        </Badge>
                      )}
                      {(isAdmin || isOwner) && (
                        <div className="flex items-center gap-1">
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => handleEdit(post)}
                            >
                              <Edit3 className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm("Delete this post?")) {
                                deleteMutation.mutate(post.id);
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Post Title & Content */}
                  <h3 className="text-lg font-bold text-foreground">{post.title}</h3>
                  <div className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                    {post.body}
                  </div>

                  {/* Comments Section Toggle */}
                  {!isPending && (
                    <div className="mt-4 pt-3 border-t border-border/60">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-xs text-muted-foreground hover:text-foreground h-8 px-2"
                        onClick={() =>
                          setExpandedComments((prev) => ({
                            ...prev,
                            [post.id]: !prev[post.id],
                          }))
                        }
                      >
                        <MessageCircle className="size-3.5" />
                        {expandedComments[post.id] ? "Hide Replies" : "View & Reply"}
                      </Button>

                      {expandedComments[post.id] && (
                        <CommentsThread
                          postId={post.id}
                          currentUserId={user?.id}
                          isAdmin={isAdmin}
                          currentUser={{
                            name: currentDisplayName,
                            avatar: currentAvatar,
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create / Edit Post Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingPost ? "Edit Post" : "Create Community Discussion"}</DialogTitle>
              <DialogDescription>
                {isAdmin
                  ? "As an admin, your post will publish immediately."
                  : "Posts are held for review by a moderator before appearing publicly."}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!title.trim() || !body.trim()) {
                  setError("Title and message are required.");
                  return;
                }
                saveMutation.mutate();
              }}
              className="space-y-4 pt-2"
            >
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Title
                </label>
                <Input
                  placeholder="e.g., Favorite bedtime stories with Spark Studio?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Your Message
                </label>
                <Textarea
                  placeholder="Share details, ask a question, or explain your tips..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={10000}
                  className="mt-1 resize-y font-mono text-sm"
                  required
                />
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="pinned"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="pinned" className="text-sm font-medium cursor-pointer">
                    Pin this announcement to top
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
                  {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  {editingPost ? "Update Post" : isAdmin ? "Publish Post" : "Submit for Review"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Profile Dialog */}
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Your Community Profile</DialogTitle>
              <DialogDescription>
                Customize how your name and avatar appear to others.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                profileMutation.mutate();
              }}
              className="space-y-4 pt-2"
            >
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Display Name
                </label>
                <Input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g. Spencer"
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Avatar Image URL
                </label>
                <Input
                  value={profileAvatar}
                  onChange={(e) => setProfileAvatar(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Paste a direct link to any image, or leave blank to show your initials.
                </p>
              </div>

              {profileAvatar && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                  <img
                    src={profileAvatar}
                    alt="Preview"
                    className="size-12 rounded-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                  <span className="text-xs text-muted-foreground">Preview</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={profileMutation.isPending}>
                  {profileMutation.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}
                  Save Profile
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Comments Thread Component
// ---------------------------------------------------------------------------
function CommentsThread({
  postId,
  currentUserId,
  isAdmin,
  currentUser,
}: {
  postId: string;
  currentUserId?: string;
  isAdmin: boolean;
  currentUser: { name: string; avatar: string };
}) {
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState("");

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["community-comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as CommentItem[];
    },
  });

  const commentMutation = useMutation({
    mutationFn: async () => {
      if (!currentUserId) throw new Error("Please sign in to reply");
      const { error } = await (supabase.from("community_comments") as any).insert({
        post_id: postId,
        user_id: currentUserId,
        author_name: currentUser.name || "Member",
        author_avatar: currentUser.avatar || null,
        body: commentText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["community-comments", postId] });
      toast.success("Reply posted!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to post comment");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-comments", postId] });
    },
  });

  return (
    <div className="mt-3 space-y-3 pt-2">
      {isLoading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="size-3 animate-spin" /> Loading replies...
        </div>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No replies yet. Start the conversation below!
        </p>
      ) : (
        <div className="space-y-2.5">
          {comments.map((c) => {
            const isOwner = currentUserId === c.user_id;
            return (
              <div
                key={c.id}
                className="flex items-start gap-2.5 rounded-xl bg-card/80 border p-3 text-xs"
              >
                {c.author_avatar ? (
                  <img
                    src={c.author_avatar}
                    alt={c.author_name}
                    className="size-7 rounded-full object-cover border"
                  />
                ) : (
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                    {(c.author_name || "M").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-foreground">{c.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{c.body}</p>
                </div>
                {(isAdmin || isOwner) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteCommentMutation.mutate(c.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reply input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (commentText.trim()) commentMutation.mutate();
        }}
        className="flex items-center gap-2 pt-1"
      >
        <Input
          placeholder="Write a reply..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          className="text-xs h-9"
          required
        />
        <Button
          type="submit"
          size="sm"
          className="h-9 gap-1 text-xs"
          disabled={commentMutation.isPending || !commentText.trim()}
        >
          {commentMutation.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Send className="size-3" />
          )}
          Reply
        </Button>
      </form>
    </div>
  );
}
