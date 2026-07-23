import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { yotoGetJson, YotoNotConnectedError } from "@/lib/yoto/api.server";
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

interface YotoCard {
  cardId: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
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

interface YotoCardsResponse {
  cards?: YotoCard[];
}

function mapCard(card: YotoCard, source: "myo" | "family"): PlaylistSummary {
  const title = card.metadata?.title ?? card.title ?? "Untitled";
  const chapters = card.content?.chapters ?? [];
  const trackCount = chapters.reduce((acc, ch) => acc + (ch.tracks?.length ?? 0), 0);
  return {
    playlistId: card.cardId,
    name: title,
    type: source === "myo" ? "myo_playlist" : "playlist",
    artwork: card.metadata?.cover?.imageL ?? card.metadata?.cover?.imageM ?? "",
    duration: card.metadata?.duration ?? card.metadata?.media?.duration ?? 0,
    trackCount: trackCount || undefined,
    createdDate: card.createdAt ?? "",
    isEditable: source === "myo",
    author: card.metadata?.author ?? "",
    description: card.metadata?.description ?? "",
    source,
  };
}

export const getPlaylistsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlaylistData> => {
    try {
      const [myoRes, familyRes] = await Promise.allSettled([
        yotoGetJson<YotoCardsResponse>(context.userId, "/card/mine"),
        yotoGetJson<YotoCardsResponse>(context.userId, "/card/family/library"),
      ]);

      const myo = myoRes.status === "fulfilled" ? (myoRes.value.cards ?? []) : [];
      const family = familyRes.status === "fulfilled" ? (familyRes.value.cards ?? []) : [];

      // Deduplicate: MYO cards may also appear in the family library
      const seen = new Set<string>();
      const playlists: PlaylistSummary[] = [];
      for (const c of myo) {
        if (seen.has(c.cardId)) continue;
        seen.add(c.cardId);
        playlists.push(mapCard(c, "myo"));
      }
      for (const c of family) {
        if (seen.has(c.cardId)) continue;
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
      const response = await yotoGetJson<unknown>(
        context.userId,
        `/content/${data.playlistId}`,
      );
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
