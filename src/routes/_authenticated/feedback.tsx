import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareHeart, Bug, Lightbulb, Send, Loader2 } from "lucide-react";
import { submitFeedback } from "@/lib/feedback.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/feedback")({
  head: () => ({
    meta: [
      { title: "Feedback — Yoto Control Center" },
      { name: "description", content: "Report an issue or request a feature for Yoto Control Center." },
      { property: "og:title", content: "Feedback — Yoto Control Center" },
      { property: "og:description", content: "Report an issue or request a feature for Yoto Control Center." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const [kind, setKind] = useState<"issue" | "feature">("issue");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const send = useServerFn(submitFeedback);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const onSubmit = async () => {
    if (message.trim().length < 3) {
      toast.error("Please write a little more detail first.");
      return;
    }
    setSending(true);
    try {
      await send({ data: { kind, message: message.trim(), page: pathname } });
      toast.success("Thanks! Your feedback was sent.");
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send feedback.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <MessageSquareHeart className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Feedback</h1>
          <p className="text-sm text-muted-foreground">
            Spotted a problem or have an idea? Tell us about it.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setKind("issue")}
          className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${
            kind === "issue" ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <Bug className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold">Report an issue</div>
            <div className="text-xs text-muted-foreground">Something isn't working</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setKind("feature")}
          className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${
            kind === "feature" ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <Lightbulb className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold">Request a feature</div>
            <div className="text-xs text-muted-foreground">An idea to make it better</div>
          </div>
        </button>
      </div>

      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          kind === "issue"
            ? "What happened? What were you trying to do?"
            : "What would you like to see? How would it help?"
        }
        className="min-h-40 rounded-2xl"
        maxLength={5000}
      />

      <Button onClick={onSubmit} disabled={sending} className="w-full rounded-full sm:w-auto">
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
        Send feedback
      </Button>
    </div>
  );
}
