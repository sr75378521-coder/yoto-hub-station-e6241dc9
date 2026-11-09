import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "yoto_last_seen_news_id";

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  // Fetch the latest published news post
  const { data: latestPost } = useQuery({
    queryKey: ["latest-news-post-popup"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching latest announcement:", error);
        return null;
      }
      return data;
    },
    staleTime: 1000 * 60 * 5, // Check every 5 minutes
  });

  useEffect(() => {
    if (!latestPost) return;

    const lastSeenId = localStorage.getItem(STORAGE_KEY);
    // If the user hasn't seen this post yet, open the dialog
    if (lastSeenId !== latestPost.id) {
      setOpen(true);
    }
  }, [latestPost]);

  const handleDismiss = () => {
    if (latestPost) {
      localStorage.setItem(STORAGE_KEY, latestPost.id);
    }
    setOpen(false);
  };

  if (!latestPost) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="gap-1 text-xs">
              <Sparkles className="size-3 text-amber-500" />
              What's New
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(latestPost.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
          <DialogTitle className="text-xl font-bold leading-tight">
            {latestPost.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Announcement popup for Yoto Control Center updates.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border-y my-2">
          {latestPost.body}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Link
            to="/news"
            onClick={handleDismiss}
            className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
          >
            All Updates <ArrowRight className="size-3" />
          </Link>
          <Button onClick={handleDismiss} className="gap-1.5">
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
