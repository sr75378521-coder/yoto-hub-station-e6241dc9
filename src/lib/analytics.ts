type GoogleAnalytics = (command: "event", eventName: string, parameters?: Record<string, string | number | boolean>) => void;

declare global {
  interface Window {
    gtag?: GoogleAnalytics;
  }
}

/** Send a custom GA4 event without allowing analytics failures to disrupt the app. */
export function trackGoogleAnalyticsEvent(
  eventName: string,
  parameters: Record<string, string | number | boolean> = {},
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, parameters);
}
