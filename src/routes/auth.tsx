import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Phone, Radio } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Yoto Control Center" },
      { name: "description", content: "Sign in to Yoto Control Center." },
      { property: "og:title", content: "Sign in · Yoto Control Center" },
      { property: "og:description", content: "Sign in to Yoto Control Center." },
    ],
  }),
  component: AuthPage,
});

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5a4.7 4.7 0 0 1-2 3.1l3.2 2.5c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2H12z" />
      <path fill="#34A853" d="M6.6 14.3 5.9 15l-2.6 2c1.6 3.2 5 5.4 8.7 5.4 2.7 0 5-.9 6.7-2.4l-3.2-2.5c-.9.6-2 1-3.5 1a5.4 5.4 0 0 1-5.4-4.2z" />
      <path fill="#FBBC05" d="M3.3 7C2.6 8.4 2.2 10.1 2.2 12s.4 3.6 1.1 5l3.3-2.7a5.6 5.6 0 0 1 0-3.4z" />
      <path fill="#4285F4" d="M12 5.9c1.5 0 2.9.5 3.9 1.5l2.9-2.9C17 2.8 14.7 1.8 12 1.8 8.3 1.8 4.9 4 3.3 7l3.3 2.7A5.4 5.4 0 0 1 12 5.9z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.8zM14.2 5c.6-.8 1.1-1.9 1-3-1 0-2.2.6-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.5z" />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [social, setSocial] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: "google" | "apple") => {
    setSocial(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? `Couldn't sign in with ${provider}`);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSocial(null);
    }
  };

  const sendOtp = async () => {
    if (!phone.trim()) return toast.error("Enter your phone number");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: phone.trim() });
      if (error) throw error;
      setOtpSent(true);
      toast.success("We texted you a code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the code");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: "sms",
      });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "var(--gradient-hero)" }}
      />
      <Card className="relative z-10 w-full max-w-md border-border/60 bg-card/80 backdrop-blur">
        <CardContent className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Radio className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Yoto Control Center</h1>
              <p className="text-xs text-muted-foreground">
                {mode === "signup" ? "Create your account" : "Sign in to your account"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              disabled={social !== null}
              onClick={() => void oauth("google")}
            >
              {social === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />}
              Continue with Google
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={social !== null}
              onClick={() => void oauth("apple")}
            >
              {social === "apple" ? <Loader2 className="size-4 animate-spin" /> : <AppleMark />}
              Continue with Apple
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setPhoneMode((v) => !v);
                setOtpSent(false);
              }}
            >
              <Phone className="size-4" />
              {phoneMode ? "Use email instead" : "Continue with phone"}
            </Button>
          </div>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          {phoneMode ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 555 123 4567"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={otpSent}
                />
              </div>
              {otpSent && (
                <div className="space-y-1.5">
                  <Label htmlFor="otp">6-digit code</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>
              )}
              <Button
                className="w-full"
                disabled={loading}
                onClick={() => void (otpSent ? verifyOtp() : sendOtp())}
              >
                {loading ? "Please wait…" : otpSent ? "Verify & sign in" : "Text me a code"}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>
          )}

          {!phoneMode && (
            <div className="mt-6 text-center text-xs text-muted-foreground">
              {mode === "signup" ? "Already have an account?" : "No account yet?"}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Sign in" : "Create one"}
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
