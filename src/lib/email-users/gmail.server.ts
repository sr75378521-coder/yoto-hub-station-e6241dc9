import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const CONCURRENCY_LIMIT = 6;

function getGatewayHeaders(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !gmailKey) {
    throw new Error("Gmail connection credentials are not configured on the server.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": gmailKey,
  };
}

const toBase64Utf8 = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

const encodeMimeHeader = (value: string): string => {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  return /^[\x00-\x7F]*$/.test(clean) ? clean : `=?UTF-8?B?${toBase64Utf8(clean)}?=`;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateTrackingToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createRawMimeMessage(opts: {
  to: string;
  subject: string;
  body: string;
  trackingPixelUrl?: string;
  fromEmail?: string;
  fromName?: string;
}): string {
  const cleanTo = opts.to.replace(/[\r\n]+/g, "").trim();
  const boundary = `ycc_${generateTrackingToken().slice(0, 16)}`;
  const plainBody = opts.body.replace(/\r?\n/g, "\r\n");
  const htmlLines = escapeHtml(opts.body).replace(/\r?\n/g, "<br/>");
  const pixelTag = opts.trackingPixelUrl
    ? `<img src="${escapeHtml(opts.trackingPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`
    : "";
  const htmlBody = `<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#111;"><div>${htmlLines}</div>${pixelTag}</body></html>`;

  const lines: string[] = [];
  if (opts.fromEmail) {
    const cleanFrom = opts.fromEmail.replace(/[\r\n]+/g, "").trim();
    lines.push(
      opts.fromName?.trim()
        ? `From: ${encodeMimeHeader(opts.fromName)} <${cleanFrom}>`
        : `From: ${cleanFrom}`,
    );
  }
  lines.push(
    `To: ${cleanTo}`,
    `Subject: ${encodeMimeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    plainBody,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    htmlBody,
    `--${boundary}--`,
  );
  return toBase64Utf8(lines.join("\r\n"))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface GmailStatus {
  connected: boolean;
  emailAddress: string | null;
  error: string | null;
}

export async function fetchGmailSenderProfile(): Promise<GmailStatus> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !gmailKey) {
    return { connected: false, emailAddress: null, error: "Gmail is not connected yet." };
  }

  const res = await fetch(`${GATEWAY_URL}/users/me/profile`, {
    headers: getGatewayHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Gmail profile check failed [${res.status}]: ${text}`);
    return {
      connected: false,
      emailAddress: null,
      error: `Could not verify Gmail account (${res.status}).`,
    };
  }
  const body = (await res.json()) as { emailAddress?: string };
  return {
    connected: Boolean(body.emailAddress),
    emailAddress: body.emailAddress ?? null,
    error: null,
  };
}

export interface OutgoingMessageItem {
  id: string;
  to: string;
  recipientLabel?: string;
  subject: string;
  body: string;
}

export interface SendItemResult {
  id: string;
  to: string;
  ok: boolean;
  messageId?: string;
  error?: string;
}

async function sendSingleEmail(
  item: OutgoingMessageItem,
  headers: Record<string, string>,
  trackingOrigin: string,
  batchId: string,
  fromName?: string,
  fromEmail?: string,
): Promise<SendItemResult> {
  const token = generateTrackingToken();
  const pixelUrl = `${trackingOrigin.replace(/\/$/, "")}/api/public/open?t=${token}`;
  try {
    const raw = createRawMimeMessage({
      to: item.to,
      subject: item.subject,
      body: item.body,
      trackingPixelUrl: pixelUrl,
      ...(fromEmail ? { fromEmail } : {}),
      ...(fromName ? { fromName } : {}),
    });
    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Gmail send failed for ${item.to} [${res.status}]: ${errText}`);
      let reason = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText) as { error?: { message?: string } };
        if (parsed.error?.message) reason = parsed.error.message;
      } catch {
        if (errText) reason = errText.slice(0, 160);
      }
      await supabaseAdmin.from("sent_emails").insert({
        batch_id: batchId,
        recipient_email: item.to,
        recipient_label: item.recipientLabel ?? "",
        subject: item.subject,
        tracking_token: token,
        status: "failed",
        error_message: reason,
      });
      return { id: item.id, to: item.to, ok: false, error: reason };
    }
    const payload = (await res.json()) as { id?: string };
    await supabaseAdmin.from("sent_emails").insert({
      batch_id: batchId,
      recipient_email: item.to,
      recipient_label: item.recipientLabel ?? "",
      subject: item.subject,
      tracking_token: token,
      status: "sent",
      gmail_message_id: payload.id ?? null,
    });
    return {
      id: item.id,
      to: item.to,
      ok: true,
      ...(payload.id ? { messageId: payload.id } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error while sending";
    await supabaseAdmin.from("sent_emails").insert({
      batch_id: batchId,
      recipient_email: item.to,
      recipient_label: item.recipientLabel ?? "",
      subject: item.subject,
      tracking_token: token,
      status: "failed",
      error_message: message,
    });
    return { id: item.id, to: item.to, ok: false, error: message };
  }
}

export async function sendGmailChunk(opts: {
  batchId: string;
  trackingOrigin: string;
  messages: OutgoingMessageItem[];
  fromName?: string;
}): Promise<SendItemResult[]> {
  const headers = getGatewayHeaders();
  let fromEmail: string | undefined;
  if (opts.fromName?.trim()) {
    const profile = await fetchGmailSenderProfile();
    if (profile.emailAddress) fromEmail = profile.emailAddress;
  }

  const results: SendItemResult[] = [];
  for (let i = 0; i < opts.messages.length; i += CONCURRENCY_LIMIT) {
    const slice = opts.messages.slice(i, i + CONCURRENCY_LIMIT);
    const settled = await Promise.all(
      slice.map((msg) =>
        sendSingleEmail(msg, headers, opts.trackingOrigin, opts.batchId, opts.fromName, fromEmail),
      ),
    );
    results.push(...settled);
  }
  return results;
}
