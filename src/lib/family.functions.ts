import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface FamilyGroupMember {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: "admin" | "member";
  canEdit: boolean;
}

export interface FamilyGroupInvite {
  id: string;
  email: string;
  role: "admin" | "member";
  canEdit: boolean;
}

export interface FamilySharedPlaylist {
  id: string;
  cardId: string;
  title: string;
  artwork: string | null;
  canEdit: boolean;
}

export interface FamilyGroup {
  id: string;
  name: string;
  ownerId: string;
  myRole: "admin" | "member";
  myCanEdit: boolean;
  members: FamilyGroupMember[];
  invites: FamilyGroupInvite[];
  playlists: FamilySharedPlaylist[];
}

export interface FamilyGroupsResult {
  groups: FamilyGroup[];
  myEmail: string | null;
  error?: string;
}

export const getFamilyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FamilyGroupsResult> => {
    const supabase = context.supabase;
    const email = ((context.claims as Record<string, unknown>)?.["email"] as string) ?? null;

    try {
      // Auto-accept any invitations addressed to this account.
      if (email) {
        const { data: pending } = await supabase
          .from("family_invites")
          .select("id, family_id, role, can_edit, email, accepted_at")
          .is("accepted_at", null);
        for (const inv of pending ?? []) {
          if ((inv.email ?? "").toLowerCase() !== email.toLowerCase()) continue;
          await supabase.from("family_members").insert({
            family_id: inv.family_id,
            user_id: context.userId,
            email,
            role: inv.role,
            can_edit: inv.can_edit,
          });
          await supabase
            .from("family_invites")
            .update({ accepted_at: new Date().toISOString() })
            .eq("id", inv.id);
        }
      }

      const { data: memberships, error } = await supabase
        .from("family_members")
        .select("family_id, role, can_edit")
        .eq("user_id", context.userId);
      if (error) throw error;

      const groups: FamilyGroup[] = [];
      for (const m of memberships ?? []) {
        const [fam, members, invites, playlists] = await Promise.all([
          supabase.from("families").select("id, name, owner_id").eq("id", m.family_id).maybeSingle(),
          supabase
            .from("family_members")
            .select("user_id, email, display_name, role, can_edit")
            .eq("family_id", m.family_id),
          supabase
            .from("family_invites")
            .select("id, email, role, can_edit, accepted_at")
            .eq("family_id", m.family_id)
            .is("accepted_at", null),
          supabase
            .from("family_shared_playlists")
            .select("id, card_id, title, artwork, can_edit")
            .eq("family_id", m.family_id),
        ]);
        if (!fam.data) continue;
        groups.push({
          id: fam.data.id,
          name: fam.data.name,
          ownerId: fam.data.owner_id,
          myRole: m.role as "admin" | "member",
          myCanEdit: m.can_edit,
          members: (members.data ?? []).map((x) => ({
            userId: x.user_id,
            email: x.email,
            displayName: x.display_name,
            role: x.role as "admin" | "member",
            canEdit: x.can_edit,
          })),
          invites: (invites.data ?? []).map((x) => ({
            id: x.id,
            email: x.email,
            role: x.role as "admin" | "member",
            canEdit: x.can_edit,
          })),
          playlists: (playlists.data ?? []).map((x) => ({
            id: x.id,
            cardId: x.card_id,
            title: x.title,
            artwork: x.artwork,
            canEdit: x.can_edit,
          })),
        });
      }

      return { groups, myEmail: email };
    } catch (e) {
      return {
        groups: [],
        myEmail: email,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  });

export const createFamilyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { name?: unknown };
    if (typeof o?.name !== "string" || !o.name.trim()) throw new Error("Family name required");
    return { name: o.name.trim().slice(0, 80) };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    const supabase = context.supabase;
    const email = ((context.claims as Record<string, unknown>)?.["email"] as string) ?? null;
    const { data: fam, error } = await supabase
      .from("families")
      .insert({ name: data.name, owner_id: context.userId })
      .select("id")
      .single();
    if (error || !fam) return { success: false, error: error?.message ?? "Couldn't create family" };
    const { error: memberError } = await supabase.from("family_members").insert({
      family_id: fam.id,
      user_id: context.userId,
      email,
      role: "admin",
      can_edit: true,
    });
    if (memberError) return { success: false, error: memberError.message };
    return { success: true };
  });

export const inviteFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { familyId?: unknown; email?: unknown; role?: unknown; canEdit?: unknown };
    if (typeof o?.familyId !== "string") throw new Error("familyId required");
    if (typeof o?.email !== "string" || !/^\S+@\S+\.\S+$/.test(o.email))
      throw new Error("Valid email required");
    return {
      familyId: o.familyId,
      email: o.email.trim().toLowerCase(),
      role: o.role === "admin" ? ("admin" as const) : ("member" as const),
      canEdit: Boolean(o.canEdit),
    };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    const { error } = await context.supabase.from("family_invites").upsert(
      {
        family_id: data.familyId,
        email: data.email,
        role: data.role,
        can_edit: data.canEdit,
        invited_by: context.userId,
        accepted_at: null,
      },
      { onConflict: "family_id,email" },
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  });

export const cancelFamilyInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { inviteId?: unknown };
    if (typeof o?.inviteId !== "string") throw new Error("inviteId required");
    return { inviteId: o.inviteId };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    const { error } = await context.supabase.from("family_invites").delete().eq("id", data.inviteId);
    return error ? { success: false, error: error.message } : { success: true };
  });

export const updateFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { familyId?: unknown; userId?: unknown; role?: unknown; canEdit?: unknown };
    if (typeof o?.familyId !== "string" || typeof o?.userId !== "string")
      throw new Error("familyId and userId required");
    return {
      familyId: o.familyId,
      userId: o.userId,
      role: o.role === "admin" ? ("admin" as const) : ("member" as const),
      canEdit: Boolean(o.canEdit),
    };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    const { error } = await context.supabase
      .from("family_members")
      .update({ role: data.role, can_edit: data.canEdit })
      .eq("family_id", data.familyId)
      .eq("user_id", data.userId);
    return error ? { success: false, error: error.message } : { success: true };
  });

export const removeFamilyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { familyId?: unknown; userId?: unknown };
    if (typeof o?.familyId !== "string" || typeof o?.userId !== "string")
      throw new Error("familyId and userId required");
    return { familyId: o.familyId, userId: o.userId };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    const { error } = await context.supabase
      .from("family_members")
      .delete()
      .eq("family_id", data.familyId)
      .eq("user_id", data.userId);
    return error ? { success: false, error: error.message } : { success: true };
  });

export const shareFamilyPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as {
      familyId?: unknown;
      cardId?: unknown;
      title?: unknown;
      artwork?: unknown;
      canEdit?: unknown;
    };
    if (typeof o?.familyId !== "string" || typeof o?.cardId !== "string")
      throw new Error("familyId and cardId required");
    return {
      familyId: o.familyId,
      cardId: o.cardId,
      title: typeof o.title === "string" && o.title ? o.title : "Playlist",
      artwork: typeof o.artwork === "string" && o.artwork ? o.artwork : null,
      canEdit: Boolean(o.canEdit),
    };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    const { error } = await context.supabase.from("family_shared_playlists").upsert(
      {
        family_id: data.familyId,
        card_id: data.cardId,
        title: data.title,
        artwork: data.artwork,
        can_edit: data.canEdit,
        shared_by: context.userId,
      },
      { onConflict: "family_id,card_id" },
    );
    return error ? { success: false, error: error.message } : { success: true };
  });

export const unshareFamilyPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = d as { id?: unknown };
    if (typeof o?.id !== "string") throw new Error("id required");
    return { id: o.id };
  })
  .handler(async ({ context, data }): Promise<{ success: boolean; error?: string }> => {
    const { error } = await context.supabase
      .from("family_shared_playlists")
      .delete()
      .eq("id", data.id);
    return error ? { success: false, error: error.message } : { success: true };
  });
