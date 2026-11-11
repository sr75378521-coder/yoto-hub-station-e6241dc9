import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchGmailSenderProfile, sendGmailChunk } from "./gmail.server";
import { createEmailBatchRecord, listEmailBatchesWithOpens } from "./analytics.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export interface EmailUserEntry {
  id: string;
  email: string;
  name: string;
}

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return fetchGmailSenderProfile();
  });

export const getEmailOpenAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return listEmailBatchesWithOpens();
  });

export const listEmailUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: EmailUserEntry[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersRes, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);

    const users: EmailUserEntry[] = (usersRes?.users ?? [])
      .filter((u) => Boolean(u.email))
      .map((u) => {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const rawName =
          (typeof meta["full_name"] === "string" && meta["full_name"]) ||
          (typeof meta["display_name"] === "string" && meta["display_name"]) ||
          (typeof meta["name"] === "string" && meta["name"]) ||
          "";
        const email = u.email as string;
        const fallback = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
        const name = (rawName || fallback).trim();
        return { id: u.id, email, name };
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    return { users };
  });

const startBatchSchema = z.object({
  subjectTemplate: z.string().min(1).max(998),
  totalRecipients: z.number().int().min(1).max(200),
});

export const startTrackedBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startBatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const profile = await fetchGmailSenderProfile();
    if (!profile.connected || !profile.emailAddress) {
      throw new Error(profile.error ?? "Gmail is not connected.");
    }
    const batchId = await createEmailBatchRecord({
      subjectTemplate: data.subjectTemplate,
      senderEmail: profile.emailAddress,
      totalRecipients: data.totalRecipients,
    });
    return { batchId };
  });

const sendChunkSchema = z.object({
  batchId: z.string().uuid(),
  fromName: z.string().max(120).optional(),
  messages: z
    .array(
      z.object({
        id: z.string().min(1),
        to: z.string().email(),
        recipientLabel: z.string().max(200).optional(),
        subject: z.string().min(1).max(998),
        body: z.string().min(1).max(100_000),
      }),
    )
    .min(1)
    .max(6),
});

const PUBLISHED_ORIGIN = "https://yoto-hub-station.lovable.app";

function resolvePublicOrigin(): string {
  const req = getRequest();
  if (!req) return PUBLISHED_ORIGIN;
  const url = new URL(req.url);
  const fwdHost = req.headers.get("x-forwarded-host");
  if (url.hostname === "localhost" && fwdHost) {
    return `https://${fwdHost}`;
  }
  if (url.hostname === "localhost") {
    return PUBLISHED_ORIGIN;
  }
  return url.origin;
}

export const sendEmailBatchChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendChunkSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return sendGmailChunk({
      batchId: data.batchId,
      trackingOrigin: resolvePublicOrigin(),
      messages: data.messages.map((m) => ({
        id: m.id,
        to: m.to,
        subject: m.subject,
        body: m.body,
        ...(m.recipientLabel !== undefined ? { recipientLabel: m.recipientLabel } : {}),
      })),
      ...(data.fromName ? { fromName: data.fromName } : {}),
    });
  });
