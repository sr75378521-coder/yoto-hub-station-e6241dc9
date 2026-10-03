import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { yotoGetJson, resolveCardRaw, YotoNotConnectedError } from "@/lib/yoto/api.server";
import { deleteConnection } from "@/lib/yoto/tokens.server";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };


export interface PlayerSummary {
  deviceId: string;
  name: string;
  online: boolean;
  deviceType?: string | null;
  deviceFamily?: string | null;
  description?: string | null;
  releaseChannel?: string | null;
}

export interface DashboardData {
  connected: boolean;
  players: PlayerSummary[];
  errorMessage?: string;
}

interface YotoDevicesResponse {
  devices?: Array<{
    deviceId: string;
    name?: string;
    online?: boolean;
    deviceType?: string;
    deviceFamily?: string;
    description?: string;
    releaseChannel?: string;
  }>;
}

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    try {
      const data = await yotoGetJson<YotoDevicesResponse>(
        context.userId,
        "/device-v2/devices/mine",
      );
      const players: PlayerSummary[] = (data.devices ?? []).map((d) => ({
        deviceId: d.deviceId,
        name: d.name ?? "Yoto Player",
        online: Boolean(d.online),
        deviceType: d.deviceType ?? null,
        deviceFamily: d.deviceFamily ?? null,
        description: d.description ?? null,
        releaseChannel: d.releaseChannel ?? null,
      }));
      return { connected: true, players };
    } catch (e) {
      if (e instanceof YotoNotConnectedError) {
        return { connected: false, players: [] };
      }
      return {
        connected: true,
        players: [],
        errorMessage: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

export const getYotoConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ connected: boolean; yotoUserId: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("yoto_connections")
      .select("yoto_user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { connected: !!data, yotoUserId: data?.yoto_user_id ?? null };
  });

export const disconnectYoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await deleteConnection(context.userId);
    return { ok: true };
  });

// Family Data Types
export interface FamilyMember {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  profileImage?: string;
  role?: string;
}

export interface FamilyPlaylist {
  playlistId: string;
  name: string;
  artwork?: string;
  duration?: number;
  trackCount?: number;
}

export interface FamilyData {
  connected: boolean;
  members: FamilyMember[];
  familyPlaylists: FamilyPlaylist[];
  errorMessage?: string;
}

interface YotoFamilyResponse {
  users?: Array<{
    userId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    profileImage?: string;
    role?: string;
  }>;
}

interface YotoFamilyPlaylistsResponse {
  playlists?: Array<{
    playlistId: string;
    name?: string;
    artwork?: string;
    duration?: number;
    trackCount?: number;
  }>;
}

export const getFamilyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FamilyData> => {
    try {
      // Fetch family members
      const familyResponse = await yotoGetJson<YotoFamilyResponse>(
        context.userId,
        "/family/users",
      );
      const members: FamilyMember[] = (familyResponse.users ?? []).map((u) => ({
        userId: u.userId,
        firstName: u.firstName ?? "User",
        lastName: u.lastName ?? "",
        email: u.email ?? "",
        profileImage: u.profileImage ?? "",
        role: u.role ?? "member",
      }));

      // Fetch family playlists (shared playlists)
      let familyPlaylists: FamilyPlaylist[] = [];
      try {
        const playlistResponse = await yotoGetJson<YotoFamilyPlaylistsResponse>(
          context.userId,
          "/family/playlists",
        );
        familyPlaylists = (playlistResponse.playlists ?? []).map((p) => ({
          playlistId: p.playlistId,
          name: p.name ?? "Untitled Playlist",
          artwork: p.artwork ?? "",
          duration: p.duration ?? 0,
          trackCount: p.trackCount ?? 0,
        }));
      } catch (e) {
        // Family playlists endpoint might not exist or be optional
        familyPlaylists = [];
      }

      return { connected: true, members, familyPlaylists };
    } catch (e) {
      if (e instanceof YotoNotConnectedError) {
        return { connected: false, members: [], familyPlaylists: [] };
      }
      return {
        connected: true,
        members: [],
        familyPlaylists: [],
        errorMessage: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

// Playlist (Card) Types
export interface PlaylistTrack {
  trackId: string;
  title?: string;
  duration?: number;
  artist?: string;
  artwork?: string;
}

export interface PlaylistSummary {
  playlistId: string;
  name: string;
  type?: string;
  artwork?: string;
  duration?: number;
  trackCount?: number;
  createdDate?: string;
  isEditable?: boolean;
  author?: string;
  description?: string;
  source: "myo" | "family";
}

export interface PlaylistData {
  connected: boolean;
  playlists: PlaylistSummary[];
  errorMessage?: string;
}

interface YotoCardInner {
  title?: string;
  metadata?: {
    title?: string;
    description?: string;
    author?: string;
    duration?: number;
    cover?: { imageL?: string; imageM?: string; imageS?: string };
    media?: { duration?: number; fileSize?: number };
  };
  content?: {
    chapters?: Array<{ tracks?: unknown[] }>;
  };
}

interface YotoCard extends YotoCardInner {
  cardId: string;
  createdAt?: string;
  updatedAt?: string;
  // Family library wraps the card object here
  card?: YotoCardInner;
}

function mapCard(raw: YotoCard, source: "myo" | "family"): PlaylistSummary {
  // Family library nests the real card fields under `card`
  const inner: YotoCardInner = raw.card ?? raw;
  const title = inner.metadata?.title ?? inner.title ?? raw.title ?? "Untitled";
  const chapters = inner.content?.chapters ?? [];
  const trackCount = chapters.reduce((acc, ch) => acc + (ch.tracks?.length ?? 0), 0);
  return {
    playlistId: raw.cardId,
    name: title,
    type: source === "myo" ? "myo_playlist" : "playlist",
    artwork:
      inner.metadata?.cover?.imageL ??
      inner.metadata?.cover?.imageM ??
      inner.metadata?.cover?.imageS ??
      "",
    duration: inner.metadata?.duration ?? inner.metadata?.media?.duration ?? 0,
    trackCount: trackCount || undefined,
    createdDate: raw.createdAt ?? "",
    isEditable: source === "myo",
    author: inner.metadata?.author ?? "",
    description: inner.metadata?.description ?? "",
    source,
  };
}

export const getPlaylistsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlaylistData> => {
    try {
      const [myoRes, familyRes] = await Promise.allSettled([
        yotoGetJson<{ cards?: YotoCard[] }>(context.userId, "/content/mine"),
        yotoGetJson<{ cards?: YotoCard[] }>(context.userId, "/card/family/library"),
      ]);

      const myo = myoRes.status === "fulfilled" ? (myoRes.value.cards ?? []) : [];
      const family = familyRes.status === "fulfilled" ? (familyRes.value.cards ?? []) : [];

      // Deduplicate: MYO cards may also appear in the family library
      const seen = new Set<string>();
      const playlists: PlaylistSummary[] = [];
      for (const c of myo) {
        if (!c.cardId || seen.has(c.cardId)) continue;
        seen.add(c.cardId);
        playlists.push(mapCard(c, "myo"));
      }
      for (const c of family) {
        if (!c.cardId || seen.has(c.cardId)) continue;
        seen.add(c.cardId);
        playlists.push(mapCard(c, "family"));
      }


      // If both failed, surface the first error
      if (myoRes.status === "rejected" && familyRes.status === "rejected") {
        const err = myoRes.reason;
        if (err instanceof YotoNotConnectedError) {
          return { connected: false, playlists: [] };
        }
        throw err;
      }

      return { connected: true, playlists };
    } catch (e) {
      if (e instanceof YotoNotConnectedError) {
        return { connected: false, playlists: [] };
      }
      return {
        connected: true,
        playlists: [],
        errorMessage: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });





export const getPlaylistDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const obj = d as { playlistId?: unknown };
    if (typeof obj?.playlistId !== "string") throw new Error("playlistId required");
    return { playlistId: obj.playlistId };
  })
  .handler(async ({ context, data }) => {
    try {
      const response = await resolveCardRaw(context.userId, data.playlistId);
      return { success: true as const, playlist: JSON.parse(JSON.stringify(response)) as Json };
    } catch (e) {
      return {
        success: false as const,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });


// Settings Types
export interface UserSettings {
  theme?: string;
  notifications?: boolean;
  apiStatus?: string;
  accountEmail?: string;
  accountName?: string;
}

export interface SettingsData {
  connected: boolean;
  settings: UserSettings;
  errorMessage?: string;
}

export const getSettingsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SettingsData> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const accountEmail = userData?.user?.email ?? "";
      const accountName = userData?.user?.user_metadata?.full_name ?? "User";

      return {
        connected: true,
        settings: {
          theme: "auto",
          notifications: true,
          apiStatus: "connected",
          accountEmail,
          accountName,
        },
      };
    } catch (e) {
      return {
        connected: true,
        settings: {},
        errorMessage: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

export interface WebTrack {
  key: string;
  title: string;
  duration?: number;
  url: string | null;
  artwork?: string;
}

export const getPlaylistTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const obj = d as { playlistId?: unknown };
    if (typeof obj?.playlistId !== "string") throw new Error("playlistId required");
    return { playlistId: obj.playlistId };
  })
  .handler(
    async ({
      context,
      data,
    }): Promise<{ title: string; artwork?: string; tracks: WebTrack[]; canDownload: boolean; error?: string }> => {
      let canDownload = false;
      try {
        const [roleRes, mineRes] = await Promise.allSettled([
          context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle(),
          yotoGetJson<{ cards?: { cardId: string }[] }>(context.userId, "/content/mine"),
        ]);
        const isAdmin = roleRes.status === "fulfilled" && !!roleRes.value.data;
        const isMine =
          mineRes.status === "fulfilled" &&
          (mineRes.value.cards ?? []).some((c) => c.cardId === data.playlistId);
        canDownload = isAdmin || isMine;
        const res = await resolveCardRaw(context.userId, data.playlistId);
        const card = (res?.card ?? res) as Record<string, any>;
        const meta = card?.metadata ?? {};
        const cover =
          meta?.cover?.imageL ?? meta?.cover?.imageM ?? meta?.cover?.imageS ?? undefined;
        const chapters: any[] = card?.content?.chapters ?? [];
        const tracks: WebTrack[] = [];
        chapters.forEach((ch: any, ci: number) => {
          const list: any[] = ch?.tracks?.length ? ch.tracks : [ch];
          list.forEach((t: any, ti: number) => {
            const raw: string | undefined =
              t?.trackUrl ?? t?.url ?? t?.audioUrl ?? t?.transcodedAudioUrl;
            let url: string | null = null;
            if (typeof raw === "string" && /^https?:\/\//.test(raw)) {
              // Proxy through our own origin: signed Yoto media URLs can block
              // cross-origin media requests and redirect chains.
              url = `/api/yoto/audio?u=${encodeURIComponent(raw)}`;
            }
            tracks.push({
              key: `${ci}-${ti}-${t?.key ?? ""}`,
              title: t?.title ?? ch?.title ?? `Track ${tracks.length + 1}`,
              duration: typeof t?.duration === "number" ? t.duration : undefined,
              url,
              artwork:
                ch?.display?.icon16x16 ?? t?.display?.icon16x16 ?? cover ?? undefined,
            });
          });
        });
        return { title: meta?.title ?? card?.title ?? "Playlist", artwork: cover, tracks, canDownload };

      } catch (e) {
        return {
          title: "Playlist",
          tracks: [],
          canDownload,
          error: e instanceof Error ? e.message : "Unknown error",
        };
      }
    },
  );

/* ---------------------------- Admin / roles ---------------------------- */

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean }> => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const listProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ profiles: Array<{ id: string; email: string | null; is_admin: boolean }> }> => {
      const { data: isAdminRow } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();
      if (!isAdminRow) throw new Error("Forbidden");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: usersRes, error } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (error) throw new Error(error.message);

      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "admin");
      const adminIds = new Set((roles ?? []).map((r: { user_id: string }) => r.user_id));

      return {
        profiles: usersRes.users.map((u) => ({
          id: u.id,
          email: u.email ?? null,
          is_admin: adminIds.has(u.id),
        })),
      };
    },
  );

export const toggleAdminStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; isAdmin: boolean }) => data)
  .handler(async ({ context, data }): Promise<{ success: true }> => {
    const { data: isAdminRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdminRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.isAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { success: true };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export interface AdminStats {
  totalUsers: number;
  admins: number;
  connectedYoto: number;
  newUsers7d: number;
  activeUsers24h: number;
}

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminStats> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = usersRes?.users ?? [];
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    const { data: conns } = await supabaseAdmin.from("yoto_connections").select("user_id");
    const now = Date.now();
    return {
      totalUsers: users.length,
      admins: (roles ?? []).length,
      connectedYoto: (conns ?? []).length,
      newUsers7d: users.filter((u) => now - new Date(u.created_at).getTime() < 7 * 864e5).length,
      activeUsers24h: users.filter(
        (u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 864e5,
      ).length,
    };
  });

export interface AdminUserRow {
  id: string;
  email: string | null;
  is_admin: boolean;
  yoto_connected: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersRes, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const { data: conns } = await supabaseAdmin.from("yoto_connections").select("user_id");
    const adminIds = new Set((roles ?? []).map((r: { user_id: string }) => r.user_id));
    const connIds = new Set((conns ?? []).map((r: { user_id: string }) => r.user_id));
    return {
      users: (usersRes?.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? null,
        is_admin: adminIds.has(u.id),
        yoto_connected: connIds.has(u.id),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned: Boolean(
          (u as { banned_until?: string | null }).banned_until &&
            new Date((u as { banned_until?: string | null }).banned_until as string) > new Date(),
        ),
      })),
    };
  });

export const grantAdminByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) => ({ email: String(d.email ?? "").trim().toLowerCase() }))
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    await assertAdmin(context);
    if (!data.email) return { success: false, error: "Enter an email address" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = (usersRes?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === data.email);
    if (!match) return { success: false, error: "No account with that email has signed in yet" };
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: match.id, role: "admin" }, { onConflict: "user_id,role" });
    if (error) return { success: false, error: error.message };
    return { success: true };
  });

export const adminDisconnectYoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("yoto_connections")
      .delete()
      .eq("user_id", data.userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  });

/* ------------------------------------------------------------------ */
/* Extra admin controls                                               */
/* ------------------------------------------------------------------ */

export const adminSetUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; banned: boolean }) => d)
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      return { success: false, error: "You can't suspend your own account" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.banned ? "876000h" : "none",
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      return { success: false, error: "You can't delete your own account" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("yoto_connections").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  });

export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) => ({ email: String(d.email ?? "").trim() }))
  .handler(async ({ context, data }): Promise<{ success: boolean; link?: string; error?: string }> => {
    await assertAdmin(context);
    if (!data.email) return { success: false, error: "That person has no email address" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, link: link?.properties?.action_link ?? undefined };
  });

export const adminDisconnectAllYoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ success: boolean; removed: number; error?: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("yoto_connections").select("id");
    const { error } = await supabaseAdmin
      .from("yoto_connections")
      .delete()
      .neq("user_id", "00000000-0000-0000-0000-000000000000");
    if (error) return { success: false, removed: 0, error: error.message };
    return { success: true, removed: (rows ?? []).length };
  });

export const adminPurgeStaleOAuthStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ success: boolean; removed: number; error?: string }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: rows } = await supabaseAdmin
      .from("yoto_oauth_states")
      .select("state")
      .lt("expires_at", nowIso);
    const { error } = await supabaseAdmin
      .from("yoto_oauth_states")
      .delete()
      .lt("expires_at", nowIso);
    if (error) return { success: false, removed: 0, error: error.message };
    return { success: true, removed: (rows ?? []).length };
  });

export interface AdminHealth {
  connections: number;
  expiredTokens: number;
  pendingOAuthStates: number;
  staleOAuthStates: number;
  families: number;
  familyMembers: number;
  sharedPlaylists: number;
}

export const getAdminHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminHealth> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (
          c: string,
          o: { count: "exact"; head: true },
        ) => Promise<{ count: number | null }> & Record<string, unknown>;
      };
    };
    const count = async (table: string, apply?: (q: any) => any) => {
      let q: any = admin.from(table).select("*", { count: "exact", head: true });
      if (apply) q = apply(q);
      const { count: c } = await q;
      return c ?? 0;
    };
    return {
      connections: await count("yoto_connections"),
      expiredTokens: await count("yoto_connections", (q) => q.lt("expires_at", nowIso)),
      pendingOAuthStates: await count("yoto_oauth_states", (q) => q.gte("expires_at", nowIso)),
      staleOAuthStates: await count("yoto_oauth_states", (q) => q.lt("expires_at", nowIso)),
      families: await count("families"),
      familyMembers: await count("family_members"),
      sharedPlaylists: await count("family_shared_playlists"),
    };
  });
