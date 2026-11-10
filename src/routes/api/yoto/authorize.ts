import { createFileRoute, redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { YOTO_AUTH_BASE, YOTO_AUDIENCE, YOTO_SCOPES, YOTO_CALLBACK_PATH } from "@/lib/yoto/config";
import {
  generateCodeVerifier,
  codeChallengeFromVerifier,
  generateState,
} from "@/lib/yoto/pkce.server";

/**
 * Start the Yoto OAuth flow.
 * Requires the caller to be signed into the app (bearer token in Authorization header
 * for XHR, or a Supabase session cookie via top-level nav — we accept both).
 *
 * Because this is triggered by a top-level browser navigation, we accept an
 * `access_token` query param that the client already has from supabase-js.
 */
export const Route = createFileRoute("/api/yoto/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const accessToken = url.searchParams.get("access_token") ?? "";
        if (!accessToken) return new Response("Missing access_token", { status: 401 });

        // Identify the user with their Supabase access token
        const supabaseUrl = process.env.SUPABASE_URL!;
        const publishable = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(supabaseUrl, publishable, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        const { data: userData, error: userErr } = await sb.auth.getUser(accessToken);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const clientId = process.env.YOTO_CLIENT_ID;
        if (!clientId) return new Response("Server missing YOTO_CLIENT_ID", { status: 500 });

        const verifier = generateCodeVerifier();
        const challenge = codeChallengeFromVerifier(verifier);
        const state = generateState();

        // Persist PKCE state via service role (route is not auth-middleware'd)
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: insertErr } = await supabaseAdmin.from("yoto_oauth_states").insert({
          state,
          user_id: userId,
          code_verifier: verifier,
          redirect_to: "/dashboard",
        });
        if (insertErr)
          return new Response(`Failed to store state: ${insertErr.message}`, { status: 500 });

        const redirectUri = `${url.origin}${YOTO_CALLBACK_PATH}`;
        const authorize = new URL(`${YOTO_AUTH_BASE}/authorize`);
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("client_id", clientId);
        authorize.searchParams.set("redirect_uri", redirectUri);
        authorize.searchParams.set("scope", YOTO_SCOPES);
        authorize.searchParams.set("audience", YOTO_AUDIENCE);
        authorize.searchParams.set("state", state);
        authorize.searchParams.set("code_challenge", challenge);
        authorize.searchParams.set("code_challenge_method", "S256");

        throw redirect({ href: authorize.toString() });
      },
    },
  },
});
