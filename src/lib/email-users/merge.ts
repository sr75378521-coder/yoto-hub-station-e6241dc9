export const MAX_RECIPIENTS = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailUserRow {
  id: string;
  email: string;
  name: string;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function renderMergeTemplate(
  template: string,
  row: { email: string; name: string },
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim().toLowerCase();
    if (key === "email") return row.email;
    if (key === "name" || key === "first_name") return row.name;
    return "";
  });
}

export function extractTemplateTokens(template: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    if (match[1]) found.add(match[1]);
  }
  return Array.from(found);
}
