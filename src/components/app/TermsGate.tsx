import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const CURRENT_TERMS_VERSION = "2026-11-11";

export function TermsGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "required" | "accepted" | "error">("loading");
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const checkAcceptance = async () => {
    setStatus("loading");
    setErrorMessage("");
    try {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult.user) throw userError ?? new Error("Please sign in again.");

      const { data, error } = await supabase
        .from("terms_acceptances" as never)
        .select("accepted_at")
        .eq("user_id" as never, userResult.user.id)
        .eq("terms_version" as never, CURRENT_TERMS_VERSION)
        .maybeSingle();
      if (error) throw error;
      setStatus(data ? "accepted" : "required");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not check terms acceptance.");
      setStatus("error");
    }
  };

  useEffect(() => {
    void checkAcceptance();
  }, []);

  const accept = async () => {
    if (!checked || saving) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const { error } = await (supabase as any).rpc("accept_terms", {
        p_terms_version: CURRENT_TERMS_VERSION,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      setStatus("accepted");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save your acceptance.");
    } finally {
      setSaving(false);
    }
  };

  if (status === "accepted") return <>{children}</>;

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking terms acceptance…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert" className="text-sm text-destructive">{errorMessage}</p>
        <Button variant="outline" onClick={() => void checkAcceptance()}>Try again</Button>
      </div>
    );
  }

  return (
    <Dialog open>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Terms and Conditions</DialogTitle>
          <DialogDescription>
            Please review and accept these terms before continuing to the app.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-md border p-4 text-sm leading-relaxed">
          <p><strong>Yoto Control Center</strong> is an independent, third-party service and is not affiliated with, endorsed by, or operated by Yoto.</p>
          <p><strong>Use of the service.</strong> You are responsible for your account and for actions taken through the app. Use the service only with accounts and devices you are authorized to access, and follow applicable laws and the terms of services you use.</p>
          <p><strong>Content and rights.</strong> You are responsible for ensuring that you have the rights and permissions needed to upload, use, or share audio and other content. Do not use the app to distribute content unlawfully.</p>
          <p><strong>Availability and risk.</strong> The service is provided as available. Features may change or be unavailable, and device commands or content operations may not always succeed. To the extent permitted by law, the service operator is not responsible for loss resulting from use of the app.</p>
          <p><strong>Privacy.</strong> The app processes account information and, when you connect Yoto, authorization data needed to provide its features. Do not share your password or authorization codes. See the app's privacy notice for details on data handling and retention.</p>
          <p><strong>Changes.</strong> These terms may be updated. A new version may require you to review and accept the updated terms before continuing.</p>
          <p className="text-xs text-muted-foreground">Version {CURRENT_TERMS_VERSION}. These are starter terms for product acceptance, not legal advice. Have a qualified lawyer review them and publish a complete privacy notice before relying on them as binding legal terms.</p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
          <span>I have read and agree to the Terms and Conditions.</span>
        </label>
        {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
        <Button className="w-full" disabled={!checked || saving} onClick={() => void accept()}>
          {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Accept and continue"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
