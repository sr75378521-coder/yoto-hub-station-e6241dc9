import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Checkpoint = Tables<"checkpoints">;
export type StudioProject = Tables<"studio_projects">;

export const ACTIONS = [
  { value: "next", label: "Next checkpoint" },
  { value: "previous", label: "Previous checkpoint" },
  { value: "restart", label: "Restart audio" },
  { value: "pause", label: "Pause / resume" },
  { value: "stop", label: "Stop" },
  { value: "jump", label: "Jump to checkpoint" },
  { value: "none", label: "Do nothing" },
] as const;

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You need to be signed in.");
  return data.user.id;
}

export function useCurrentProject() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const projects = useQuery({
    queryKey: ["studio", "projects"],
    queryFn: async (): Promise<StudioProject[]> => {
      const userId = await requireUserId();
      const existing = await supabase
        .from("studio_projects")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (existing.error) throw existing.error;
      if (existing.data.length > 0) return existing.data;

      const created = await supabase
        .from("studio_projects")
        .insert({ user_id: userId, title: "My first playlist" })
        .select("*")
        .single();
      if (created.error) throw created.error;
      return [created.data];
    },
  });

  useEffect(() => {
    if (!projects.data?.length) return;
    const selectionExists = projects.data.some((item) => item.id === selectedProjectId);
    const firstProject = projects.data[0];
    if (!selectionExists && firstProject) setSelectedProjectId(firstProject.id);
  }, [projects.data, selectedProjectId]);

  const project = projects.data?.find((item) => item.id === selectedProjectId) ?? projects.data?.[0];
  const projectId = project?.id;

  const checkpoints = useQuery({
    queryKey: ["studio", "checkpoints", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Checkpoint[]> => {
      const { data, error } = await supabase
        .from("checkpoints")
        .select("*")
        .eq("project_id", projectId ?? "")
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["studio", "checkpoints", projectId] });

  const addCheckpoint = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Choose a playlist first.");
      const userId = await requireUserId();
      const list = checkpoints.data ?? [];
      const index = list.length;
      const { error } = await supabase.from("checkpoints").insert({
        project_id: projectId,
        user_id: userId,
        order_index: index,
        title: `Checkpoint ${index + 1}`,
        is_start: index === 0,
        icon: "🎧",
        pos_x: 40 + (index % 3) * 590,
        pos_y: 40 + Math.floor(index / 3) * 340,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateCheckpoint = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Checkpoint> }) => {
      const { error } = await supabase.from("checkpoints").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeCheckpoint = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checkpoints").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const renameProject = useMutation({
    mutationFn: async (title: string) => {
      if (!projectId) throw new Error("Choose a playlist first.");
      const { error } = await supabase.from("studio_projects").update({ title }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["studio", "projects"] }),
  });

  const createProject = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const count = projects.data?.length ?? 0;
      const created = await supabase
        .from("studio_projects")
        .insert({ user_id: userId, title: `New playlist ${count + 1}` })
        .select("*")
        .single();
      if (created.error) throw created.error;
      return created.data;
    },
    onSuccess: async (created) => {
      queryClient.setQueryData<StudioProject[]>(["studio", "projects"], (current) => [
        created,
        ...(current ?? []).filter((item) => item.id !== created.id),
      ]);
      setSelectedProjectId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["studio", "projects"] });
    },
  });

  const duplicateProject = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("Choose a playlist first.");
      const userId = await requireUserId();
      const created = await supabase
        .from("studio_projects")
        .insert({ user_id: userId, title: `${project.title} copy`, description: project.description })
        .select("*")
        .single();
      if (created.error) throw created.error;

      const copies = (checkpoints.data ?? []).map(({ id: _id, created_at: _createdAt, updated_at: _updatedAt, ...checkpoint }) => ({
        ...checkpoint,
        project_id: created.data.id,
        user_id: userId,
      }));
      if (copies.length) {
        const copied = await supabase.from("checkpoints").insert(copies);
        if (copied.error) throw copied.error;
      }
      return created.data;
    },
    onSuccess: async (created) => {
      setSelectedProjectId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["studio"] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Choose a playlist first.");
      const deletingId = projectId;
      const { error } = await supabase.from("studio_projects").delete().eq("id", deletingId);
      if (error) throw error;
      return deletingId;
    },
    onSuccess: async (deletedId) => {
      const next = projects.data?.find((item) => item.id !== deletedId);
      setSelectedProjectId(next?.id ?? null);
      await queryClient.invalidateQueries({ queryKey: ["studio"] });
    },
  });

  return {
    projects,
    project,
    selectedProjectId: projectId ?? null,
    selectProject: setSelectedProjectId,
    checkpoints,
    createProject,
    duplicateProject,
    deleteProject,
    addCheckpoint,
    updateCheckpoint,
    removeCheckpoint,
    renameProject,
  };
}

export async function uploadCheckpointAudio(file: File, checkpointId: string) {
  const userId = await requireUserId();
  const path = `${userId}/${checkpointId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from("studio-audio").upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function getAudioUrl(path: string) {
  const { data, error } = await supabase.storage.from("studio-audio").createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Create one box per audio file, stacked top-to-bottom and chained with auto-advance arrows. */
export async function addAudioBoxes(
  projectId: string,
  files: File[],
  existing: Checkpoint[],
  durationOf: (file: File) => Promise<number | null>,
) {
  const userId = await requireUserId();
  const maxY = existing.reduce((m, c) => Math.max(m, c.pos_y), -200);
  const sorted = [...existing].sort((a, b) => b.pos_y - a.pos_y);
  let prev: Checkpoint | undefined = sorted[0];
  const baseX = prev?.pos_x ?? 400;
  for (const [i, file] of files.entries()) {
    const created = await supabase
      .from("checkpoints")
      .insert({
        project_id: projectId,
        user_id: userId,
        order_index: existing.length + i,
        title: file.name.replace(/\.[^.]+$/, "").slice(0, 80),
        is_start: existing.length === 0 && i === 0,
        icon: "🎧",
        pos_x: baseX,
        pos_y: maxY + 200 * (i + 1),
        auto_advance: false,
        left_action: "none",
        right_action: "none",
      })
      .select("*")
      .single();
    if (created.error) throw created.error;
    const path = await uploadCheckpointAudio(file, created.data.id);
    const duration = await durationOf(file);
    const upd = await supabase
      .from("checkpoints")
      .update({ audio_path: path, audio_name: file.name, audio_size: file.size, audio_duration: duration })
      .eq("id", created.data.id);
    if (upd.error) throw upd.error;
    if (prev && !prev.auto_target) {
      await supabase.from("checkpoints").update({ auto_advance: true, auto_target: created.data.id }).eq("id", prev.id);
    }
    prev = created.data;
  }
}
