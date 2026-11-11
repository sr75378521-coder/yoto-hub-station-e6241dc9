import { getMembership } from "./billing.server";
import { canUseAction } from "./plans";

/**
 * Run AI work with the app's plan-based feature checks. Gemini requests use the
 * configured Google API key, so do not reserve the app's separate gateway credits.
 */
export async function withCredits<T>(
  userId: string,
  _key: string,
  _cost: number,
  action: string,
  work: () => Promise<T>,
): Promise<T> {
  const membership = await getMembership(userId);
  if (!canUseAction(membership.plan, action))
    throw new Error(
      action === "animated"
        ? "Animated icons require Pro Max."
        : "AI icons require Pro or Pro Max.",
    );
  return work();
}

export async function checkedGatewayFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response
      .clone()
      .json()
      .catch(() => ({}));
    throw new Error(body.message ?? body.error?.message ?? `AI request failed (${response.status}).`);
  }
  return response;
}
