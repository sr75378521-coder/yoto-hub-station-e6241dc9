import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface SentEmailAnalyticsRow {
  id: string;
  recipientEmail: string;
  recipientLabel: string;
  subject: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
}

export interface EmailBatchAnalytics {
  id: string;
  subjectTemplate: string;
  senderEmail: string;
  totalRecipients: number;
  createdAt: string;
  sentCount: number;
  openedCount: number;
  totalOpens: number;
  recipients: SentEmailAnalyticsRow[];
}

export async function createEmailBatchRecord(opts: {
  subjectTemplate: string;
  senderEmail: string;
  totalRecipients: number;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("email_batches")
    .insert({
      subject_template: opts.subjectTemplate,
      sender_email: opts.senderEmail,
      total_recipients: opts.totalRecipients,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to initialize tracking batch: ${error?.message ?? "unknown"}`);
  }
  return data.id;
}

export async function listEmailBatchesWithOpens(): Promise<EmailBatchAnalytics[]> {
  const { data: batches, error: batchErr } = await supabaseAdmin
    .from("email_batches")
    .select("id, subject_template, sender_email, total_recipients, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (batchErr) {
    console.error("[Analytics] Failed to load batches:", batchErr);
    throw new Error("Could not load email open analytics.");
  }
  if (!batches || batches.length === 0) return [];

  const batchIds = batches.map((b) => b.id);
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from("sent_emails")
    .select(
      "id, batch_id, recipient_email, recipient_label, subject, status, error_message, sent_at, first_opened_at, last_opened_at, open_count",
    )
    .in("batch_id", batchIds)
    .order("sent_at", { ascending: true })
    .limit(4000);

  if (rowsErr) {
    console.error("[Analytics] Failed to load sent_emails:", rowsErr);
    throw new Error("Could not load recipient open details.");
  }

  const grouped = new Map<string, SentEmailAnalyticsRow[]>();
  for (const r of rows ?? []) {
    const list = grouped.get(r.batch_id) ?? [];
    list.push({
      id: r.id,
      recipientEmail: r.recipient_email,
      recipientLabel: r.recipient_label,
      subject: r.subject,
      status: r.status,
      errorMessage: r.error_message,
      sentAt: r.sent_at,
      firstOpenedAt: r.first_opened_at,
      lastOpenedAt: r.last_opened_at,
      openCount: r.open_count,
    });
    grouped.set(r.batch_id, list);
  }

  return batches.map((b) => {
    const recipients = grouped.get(b.id) ?? [];
    const sentCount = recipients.filter((r) => r.status === "sent").length;
    const openedCount = recipients.filter((r) => r.openCount > 0).length;
    const totalOpens = recipients.reduce((acc, r) => acc + r.openCount, 0);
    return {
      id: b.id,
      subjectTemplate: b.subject_template,
      senderEmail: b.sender_email,
      totalRecipients: b.total_recipients,
      createdAt: b.created_at,
      sentCount,
      openedCount,
      totalOpens,
      recipients,
    };
  });
}
