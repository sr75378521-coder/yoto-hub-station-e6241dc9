import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FEEDBACK_EMAIL = "sr75378521@gmail.com";

const feedbackSchema = z.object({
  kind: z.enum(["issue", "feature"]),
  message: z.string().min(3).max(5000),
  page: z.string().max(200).optional(),
});

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => feedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email ?? "unknown";

    const { error } = await supabase.from("feedback").insert({
      user_id: userId,
      kind: data.kind,
      message: data.message,
      page: data.page ?? null,
    });
    if (error) throw new Error(error.message);

    // Email the site owner when a Resend key is configured.
    const resendKey = process.env["RESEND_API_KEY"];
    if (resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Yoto Control Center <onboarding@resend.dev>",
            to: [FEEDBACK_EMAIL],
            subject: `[Yoto Control Center] ${data.kind === "issue" ? "Issue report" : "Feature request"} from ${email}`,
            text: `Type: ${data.kind}\nFrom: ${email}\nPage: ${data.page ?? "n/a"}\n\n${data.message}`,
          }),
        });
        if (!res.ok) {
          console.error(`Feedback email failed [${res.status}]: ${await res.text()}`);
        }
      } catch (e) {
        console.error("Feedback email error:", e);
      }
    }

    return { ok: true, emailed: Boolean(resendKey) };
  });
