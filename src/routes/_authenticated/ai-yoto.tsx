import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  Bot,
  Check,
  CloudDownload,
  FileAudio,
  FolderOpen,
  Loader2,
  Merge,
  Save,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppShell } from "@/components/app/AppShell";
import { ConnectYotoCard } from "@/components/app/ConnectYotoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import {
  membershipOptions,
  connectionOptions,
  draftsOptions,
  type Draft,
} from "@/lib/ai-yoto/queries";
import {
  chatEditPlaylist,
  generatePixels,
  organizeSegments,
  transcribeSegment,
} from "@/lib/ai-yoto/studio.functions";
import {
  PLANS,
  AI_COSTS,
  TRANSCRIPTION_SEGMENT_SECONDS,
  applyChapterPlan,
  mergeChapters,
  canUseAction,
  chapterSegments,
  remainingTranscriptionCost,
  type AiChapter,
  type AudioSegment,
} from "@/lib/ai-yoto/plans";
import { openAudio, fileDuration } from "@/lib/ai-yoto/audio.browser";
import { pixelFile } from "@/lib/ai-yoto/pixels.browser";
import { uploadTrack, saveCard, getCardForEdit } from "@/lib/yoto/myo.functions";
import { getPlaylistsData, type PlaylistSummary } from "@/lib/players.functions";
import { uploadIcon } from "@/lib/yoto/icons.functions";
import { useIconSrc } from "@/components/app/IconPicker";
import { fmtTime } from "@/lib/audio/engine";
import { playlistTool } from "@/lib/community/community.functions";
import { TOOL_RANK, type PlaylistTool } from "@/lib/community/rules";

export const Route = createFileRoute("/_authenticated/ai-yoto")({
  validateSearch: (search: Record<string, unknown>): { draft?: string } => ({
    draft: typeof search.draft === "string" ? search.draft : undefined,
  }),
  head: () => ({
    meta: [
      { title: "AI Yoto · Yoto Control Center" },
      {
        name: "description",
        content:
          "Turn long audio into editable Yoto chapters, create pixel icons and publish to your connected Yoto account.",
      },
      { property: "og:title", content: "AI Yoto · Audio chapters" },
      {
        property: "og:description",
        content: "Transcribe, organize and save your audio stories to Yoto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(membershipOptions()),
      context.queryClient.ensureQueryData(connectionOptions()),
      context.queryClient.ensureQueryData(draftsOptions()),
    ]);
  },
  component: AiYotoPage,
});
function AiYotoPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const membership = useSuspenseQuery(membershipOptions());
  const connection = useSuspenseQuery(connectionOptions());
  const drafts = useSuspenseQuery(draftsOptions());
  const transcribe = useServerFn(transcribeSegment),
    organize = useServerFn(organizeSegments),
    chatFn = useServerFn(chatEditPlaylist),
    listYoto = useServerFn(getPlaylistsData),
    openCard = useServerFn(getCardForEdit),
    pixels = useServerFn(generatePixels);
  const upload = useServerFn(uploadTrack),
    publishCard = useServerFn(saveCard),
    sendIcon = useServerFn(uploadIcon);
  const inputRef = useRef<HTMLInputElement>(null);
  const stop = useRef(false);
  const [file, setFile] = useState<File | null>(null),
    [duration, setDuration] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null),
    [title, setTitle] = useState(""),
    [chapters, setChapters] = useState<AiChapter[]>([]);
  const [busy, setBusy] = useState(""),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState("");
  type Msg = { role: "user" | "assistant"; content: string };
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        'Hi! I\'m AI Yoto. Upload a long audio file and I\'ll split it into chapters, or open one of your Yoto playlists and tell me what to change — like "give every chapter a fun title", "merge chapters 2 and 3" or "move the last chapter to the start".',
    },
  ]);
  const [proposal, setProposal] = useState<{
    chapters: AiChapter[];
    title: string;
    reply: string;
    removed: string[];
  } | null>(null);
  const [undo, setUndo] = useState<{ chapters: AiChapter[]; title: string }[]>([]);
  const [yotoList, setYotoList] = useState<PlaylistSummary[] | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const selected = Route.useSearch().draft;
  const selectedLoaded = useRef("");
  useEffect(() => {
    if (selected && selectedLoaded.current !== selected) {
      const found = drafts.data.find((d) => d.id === selected);
      if (found) {
        load(found);
        selectedLoaded.current = selected;
      }
    }
  }, [selected, drafts.data]);
  const runTool = useServerFn(playlistTool);
  const iconFor = useIconSrc();
  const [targetMinutes, setTargetMinutes] = useState(10);
  async function tool(action: PlaylistTool) {
    setBusy("Preparing changes…");
    setError("");
    try {
      const saved = await persist(chapters);
      const next = await runTool({ data: { id: saved.id, tool: action, minutes: targetMinutes } });
      setProposal({
        chapters: next,
        title,
        reply: "Review these playlist edits. No AI credits used.",
        removed: [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare changes.");
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      const urls: Record<string, string> = {};
      for (const chapter of chapters) {
        const path = chapter.paths[0];
        if (!path) continue;
        const signed = await supabase.storage.from("studio-audio").createSignedUrl(path, 3600);
        if (signed.data) urls[path] = signed.data.signedUrl;
      }
      if (active) setPreviews(urls);
    })();
    return () => {
      active = false;
    };
  }, [draft?.id, chapters.map((ch) => ch.paths[0]).join("|")]);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["membership"] });
    void queryClient.invalidateQueries({ queryKey: ["ai-yoto-drafts"] });
  };
  async function persist(
    next: AiChapter[],
    name = title,
    cardId = draft?.yoto_card_id,
    id = draft?.id,
  ): Promise<Draft> {
    const data = {
      user_id: user.id,
      title: name.trim() || "Untitled audio",
      chapters: JSON.parse(JSON.stringify(next)),
      yoto_card_id: cardId ?? null,
      updated_at: new Date().toISOString(),
    };
    const saved = id
      ? await supabase.from("ai_yoto_drafts").update(data).eq("id", id).select().single()
      : await supabase.from("ai_yoto_drafts").insert(data).select().single();
    if (saved.error) throw saved.error;
    const result = { ...saved.data, chapters: next } as Draft;
    setDraft(result);
    setChapters(next);
    refresh();
    return result;
  }
  function load(d: Draft) {
    setDraft(d);
    setTitle(d.title);
    setChapters(d.chapters);
    setFile(null);
    setDuration(0);
    setError("");
    setNotice("");
    setProposal(null);
    setMessages([
      { role: "assistant", content: `Opened ${d.title}. What would you like to change?` },
    ]);
  }
  async function chooseFile(value: File | null) {
    if (!value) return;
    setError("");
    setNotice("");
    setBusy("Reading audio…");
    try {
      const seconds = await fileDuration(value);
      setMessages([{ role: "assistant", content: "New audio loaded. Ready to transcribe." }]);
      setProposal(null);
      setUndo([]);
      setFile(value);
      setDuration(seconds);
      setDraft(null);
      setChapters([]);
      setTitle(value.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot read audio.");
    } finally {
      setBusy("");
    }
  }
  async function run() {
    if (!file) return;
    setError("");
    setNotice("");
    stop.current = false;
    setBusy("Preparing audio…");
    setProgress(0);
    let engine: Awaited<ReturnType<typeof openAudio>> | undefined;
    let saved = draft;
    let next = [...chapters];
    try {
      if (remainingTranscriptionCost(duration, next) > membership.data.remaining)
        throw new Error(
          "Not enough credits for this recording. Choose a higher plan or a shorter file.",
        );
      saved = await persist(next);
      engine = await openAudio(file);
      const total = Math.ceil(duration / TRANSCRIPTION_SEGMENT_SECONDS);
      for (let i = 0; i < total; i++) {
        if (stop.current) break;
        if (next[i]?.transcript) continue;
        setBusy(`Transcribing ${i + 1} of ${total}…`);
        const start = i * TRANSCRIPTION_SEGMENT_SECONDS,
          end = Math.min(duration, start + TRANSCRIPTION_SEGMENT_SECONDS);
        let path = next[i]?.paths[0];
        if (!path) {
          path = `${user.id}/ai-yoto/${saved.id}/five-minute-${i}.wav`;
          const clip = await engine.clip(start, end - start);
          const stored = await supabase.storage
            .from("studio-audio")
            .upload(path, clip, { contentType: "audio/wav", upsert: true });
          if (stored.error) throw stored.error;
          next[i] = { title: `Chapter ${i + 1}`, start, end, transcript: "", paths: [path] };
          saved = await persist(next, title, saved.yoto_card_id, saved.id);
        }
        const result = await transcribe({ data: { path } });
        next[i] = {
          title: `Chapter ${i + 1}`,
          start,
          end,
          transcript: result.transcript,
          paths: [path],
          segments: [{ start, end, path, transcript: result.transcript }],
        };
        saved = await persist(next, title, saved.yoto_card_id, saved.id);
        setProgress(((i + 1) / total) * 100);
      }
      setNotice(
        stop.current
          ? "Paused. Completed transcripts are saved."
          : "Transcription saved. Ready to organize chapters.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      engine?.close();
      setBusy("");
      refresh();
    }
  }
  async function organizeChapters() {
    setBusy("Organizing chapters…");
    setError("");
    setNotice("");
    try {
      const segments: AudioSegment[] = chapters.flatMap(chapterSegments);
      const result = await organize({ data: { key: crypto.randomUUID(), segments } });
      await persist(result);
      setNotice("Chapters organized and saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not organize chapters.");
    } finally {
      setBusy("");
      refresh();
    }
  }
  async function save() {
    setBusy("Saving…");
    setError("");
    try {
      await persist(chapters);
      setNotice("Changes saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }
  async function publish() {
    setBusy("Uploading to Yoto…");
    setError("");
    setNotice("");
    let next = [...chapters];
    try {
      if (!connection.data.connected) throw new Error("Connect your Yoto account first.");
      for (let i = 0; i < next.length; i++) {
        const chapter = next[i];
        if (!chapter) continue;
        const tracks = [...(chapter.tracks ?? [])];
        for (let j = tracks.length; j < chapter.paths.length; j++) {
          const path = chapter.paths[j];
          if (!path) continue;
          setBusy(`Uploading chapter ${i + 1}, track ${j + 1}…`);
          const download = await supabase.storage.from("studio-audio").download(path);
          if (download.error || !download.data) throw new Error("Could not read chapter audio.");
          const form = new FormData();
          form.set(
            "file",
            new File([download.data], `${chapter.title}-${j + 1}.wav`, { type: "audio/wav" }),
          );
          const result = await upload({ data: form });
          if (!result.success || !result.track)
            throw new Error(result.error ?? "Yoto upload failed.");
          tracks.push(result.track);
          next[i] = { ...chapter, tracks: [...tracks] };
          await persist(next);
        }
      }
      const result = await publishCard({
        data: {
          cardId: draft?.yoto_card_id ?? undefined,
          title,
          chapters: next.map((c, i) => ({
            key: String(i + 1),
            title: c.title,
            icon: c.icon,
            tracks: (c.tracks ?? []).map((t) => ({ ...t, title: c.title, icon: c.icon })),
          })),
        },
      });
      if (!result.success || !result.cardId)
        throw new Error(result.error ?? "Yoto did not confirm the playlist.");
      await persist(next, title, result.cardId);
      setNotice("Playlist saved to your Yoto account.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy("");
    }
  }
  async function drawIcon(
    chapter: AiChapter,
    subject: string,
    animated: boolean,
  ): Promise<AiChapter> {
    const result = await pixels({
      data: { key: crypto.randomUUID(), prompt: subject.slice(0, 1000), animated },
    });
    const file = await pixelFile(
      result,
      chapter.title
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .slice(0, 60) || "icon",
    );
    const path = `${user.id}/ai-yoto/${draft?.id ?? crypto.randomUUID()}/icon-${crypto.randomUUID()}.${animated ? "gif" : "png"}`;
    const stored = await supabase.storage
      .from("studio-audio")
      .upload(path, file, { contentType: file.type });
    if (stored.error) throw stored.error;
    const signed = await supabase.storage
      .from("studio-audio")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    let next: AiChapter = {
      ...chapter,
      iconUrl: signed.data?.signedUrl ?? URL.createObjectURL(file),
    };
    if (connection.data.connected) {
      const form = new FormData();
      form.set("file", file);
      const uploaded = await sendIcon({ data: form });
      if (uploaded.success && uploaded.icon) next = { ...next, icon: uploaded.icon.ref };
      else iconWarnings.current.push(uploaded.error ?? "Yoto upload failed");
    }
    return next;
  }
  const iconWarnings = useRef<string[]>([]);
  async function makeIcons(jobs: { index: number; subject: string; animated: boolean }[]) {
    if (!jobs.length) return;
    const allowed = jobs.filter((j) =>
      canUseAction(membership.data.plan, j.animated ? "animated" : "icon"),
    );
    if (!allowed.length) {
      setError(
        jobs.some((j) => j.animated)
          ? "Animated icons need the Pro Max plan."
          : "AI icons need the Pro plan or higher.",
      );
      return;
    }
    setError("");
    iconWarnings.current = [];
    let next = [...chapters];
    let made = 0;
    const failures: string[] = [];
    for (const [n, job] of allowed.entries()) {
      const chapter = next[job.index];
      if (!chapter) continue;
      setBusy(`Drawing icon ${n + 1} of ${allowed.length}…`);
      try {
        next[job.index] = await drawIcon(chapter, job.subject, job.animated);
        made++;
        setChapters([...next]);
      } catch (e) {
        failures.push(e instanceof Error ? e.message : "failed");
        if (/credit|plan|require/i.test(String(failures.at(-1)))) break;
      }
    }
    try {
      if (made) await persist(next);
    } catch (e) {
      failures.push(e instanceof Error ? e.message : "save failed");
    }
    setBusy("");
    refresh();
    if (made)
      setNotice(
        `${made} icon${made === 1 ? "" : "s"} created.${connection.data.connected ? ' Press "Save to Yoto" to put them on your player.' : ""}${iconWarnings.current.length ? ` (Yoto upload issue: ${iconWarnings.current[0]})` : ""}`,
      );
    if (failures.length)
      setError(
        `${failures.length} icon${failures.length === 1 ? "" : "s"} could not be made: ${failures[0]}`,
      );
  }
  async function icon(index: number, animated: boolean) {
    const chapter = chapters[index];
    if (!chapter) return;
    await makeIcons([{ index, subject: chapter.title, animated }]);
  }
  function edit(next: AiChapter[], name = title) {
    setUndo((u) => [...u.slice(-19), { chapters, title }]);
    setChapters(next);
    setTitle(name);
  }
  function undoLast() {
    const last = undo.at(-1);
    if (!last) return;
    setUndo(undo.slice(0, -1));
    setChapters(last.chapters);
    setTitle(last.title);
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= chapters.length) return;
    const next = [...chapters];
    [next[i], next[j]] = [next[j]!, next[i]!];
    edit(next);
  }
  async function browseYoto() {
    setBusy("Loading your Yoto playlists…");
    setError("");
    try {
      const res = await listYoto();
      setYotoList(res.playlists.filter((p) => p.source === "myo"));
      if (!res.connected) throw new Error(res.errorMessage ?? "Connect your Yoto account first.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load playlists.");
    } finally {
      setBusy("");
    }
  }
  async function openFromYoto(id: string) {
    setYotoList(null);
    setBusy("Opening playlist…");
    setError("");
    setNotice("");
    try {
      const res = await openCard({ data: { cardId: id } });
      if (!res.success || !res.card) throw new Error(res.error ?? "Could not open playlist.");
      let t = 0;
      const next: AiChapter[] = res.card.chapters.map((ch) => {
        const len = ch.tracks.reduce((a, tr) => a + (tr.duration ?? 0), 0);
        const c: AiChapter = {
          title: ch.title,
          start: t,
          end: t + len,
          transcript: "",
          paths: [],
          tracks: ch.tracks,
          icon: ch.icon,
          iconUrl: undefined,
        };
        t += len;
        return c;
      });
      setFile(null);
      setDuration(0);
      setUndo([]);
      setTitle(res.card.title);
      await persist(next, res.card.title, res.card.cardId, undefined);
      setProposal(null);
      setMessages([
        {
          role: "assistant",
          content: `Opened "${res.card.title}" with ${next.length} chapters. What would you like to change?`,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open playlist.");
    } finally {
      setBusy("");
    }
  }
  async function send(text = prompt) {
    const content = text.trim();
    if (!content || busy || proposal) return;
    const history: Msg[] = [...messages.slice(1), { role: "user" as const, content }].slice(-20);
    setMessages((m) => [...m, { role: "user", content }]);
    setPrompt("");
    setBusy("AI Yoto is thinking…");
    setError("");
    try {
      const res = await chatFn({
        data: {
          key: crypto.randomUUID(),
          history,
          playlist: {
            title,
            chapters: chapters.map((c) => ({
              title: c.title,
              minutes: Math.round((c.end - c.start) / 6) / 10,
              excerpt: c.transcript.slice(0, 500),
            })),
          },
        },
      });
      let reply = res.reply;
      if (res.plan || res.playlistTitle) {
        try {
          setProposal({
            chapters: res.plan ? applyChapterPlan(chapters, res.plan, res.removed) : chapters,
            title: res.playlistTitle?.trim() || title,
            reply: res.reply,
            removed: res.removed.map((i) => chapters[i]?.title ?? ""),
          });
          reply += "\n\nYour changes are ready to review.";
        } catch (e) {
          reply += `\n\n(${e instanceof Error ? e.message : "Could not apply that edit."})`;
        }
      }
      const iconJobs = res.plan ? [] : (res.icons ?? []);
      if (res.plan && res.icons?.length)
        reply += "\n\nApply the changes first, then ask me again for icons.";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      if (iconJobs.length) {
        setBusy("");
        await makeIcons(iconJobs);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Sorry — ${e instanceof Error ? e.message : "something went wrong."}`,
        },
      ]);
    } finally {
      setBusy("");
      refresh();
    }
  }
  const hasAudio = chapters.length > 0 && chapters.every((c) => c.paths.length || c.tracks?.length);
  const needsOrganize =
    chapters.length > 0 && chapters.every((c) => c.paths.length && c.transcript.trim());
  const suggestions = chapters.length
    ? [
        "Give every chapter a fun, short title",
        "Number the chapters 1, 2, 3…",
        "Merge very short chapters together",
        "Suggest a playlist name",
        "Make a pixel icon for every chapter",
      ]
    : ["How do I make a bedtime story card?", "What audio files work on Yoto?"];
  return (
    <AppShell title="AI Yoto">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-3 font-display text-3xl font-bold">
              <AudioLines className="size-8 text-primary" />
              AI Yoto
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Split audio into chapters, add titles and icons, and edit your Yoto playlists by
              chatting · {connection.data.connected ? "Yoto connected" : "Yoto not connected"}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/membership">
              <Sparkles className="size-4" />
              {membership.data.remaining} credits · {PLANS[membership.data.plan].name}
            </Link>
          </Button>
        </div>
        {!connection.data.connected && <ConnectYotoCard />}
        {error && (
          <p role="alert" className="break-words text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="flex items-center gap-2 text-sm text-primary">
            <Check className="size-4 shrink-0" />
            {notice}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"
          className="hidden"
          aria-label="Upload audio"
          onChange={(e) => {
            void chooseFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className="flex h-[560px] flex-col rounded-xl border bg-card lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
            <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
              <Bot className="size-5 text-primary" />
              Chat with AI Yoto
            </div>
            <ScrollArea className="flex-1 px-4">
              <div className="space-y-4 py-4">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      {m.role === "user" ? (
                        <User className="size-4" />
                      ) : (
                        <Bot className="size-4 text-primary" />
                      )}
                    </span>
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy === "AI Yoto is thinking…" && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Thinking…
                  </p>
                )}
                <div ref={chatEnd} />
              </div>
            </ScrollArea>
            <div className="space-y-2 border-t p-3">
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!!busy || !!proposal}
                    onClick={() => send(s)}
                    className="h-auto whitespace-normal px-2.5 py-1 text-xs"
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <Textarea
                  aria-label="Message AI Yoto"
                  className="min-h-11 resize-none"
                  rows={1}
                  value={prompt}
                  maxLength={4000}
                  placeholder="Tell AI Yoto what to change…"
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send"
                  disabled={!!busy || !!proposal || !prompt.trim() || membership.data.remaining < 1}
                >
                  <Send className="size-4" />
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">Each message uses 1 credit.</p>
            </div>
          </section>
          <section className="min-w-0 space-y-6">
            <Dialog
              open={!!proposal}
              onOpenChange={(o) => {
                if (!o) setProposal(null);
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Review playlist changes</DialogTitle>
                  <DialogDescription>{proposal?.reply}</DialogDescription>
                </DialogHeader>
                {proposal && (
                  <div className="space-y-4">
                    <p className="font-semibold">{proposal.title}</p>
                    {proposal.removed.length > 0 && (
                      <p className="text-destructive">Remove: {proposal.removed.join(", ")}</p>
                    )}
                    <ol className="max-h-72 list-inside list-decimal overflow-y-auto space-y-2">
                      {proposal.chapters.map((c, i) => (
                        <li key={i}>
                          {c.title}{" "}
                          <span className="text-muted-foreground">
                            · {fmtTime(c.end - c.start)}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setProposal(null)}>
                        Discard
                      </Button>
                      <Button
                        onClick={() => {
                          edit(proposal.chapters, proposal.title);
                          setProposal(null);
                          setNotice("Changes applied. Ready to save.");
                        }}
                      >
                        <Check className="size-4" />
                        Apply changes
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!!busy} onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" />
                Upload audio
              </Button>
              <Button
                variant="outline"
                disabled={!!busy || !connection.data.connected}
                onClick={browseYoto}
              >
                <CloudDownload className="size-4" />
                Open from Yoto
              </Button>
              {drafts.data.length > 0 && (
                <select
                  aria-label="Saved projects"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={draft?.id ?? ""}
                  disabled={!!busy}
                  onChange={(e) => {
                    const d = drafts.data.find((x) => x.id === e.target.value);
                    if (d) {
                      load(d);
                      setUndo([]);
                    }
                  }}
                >
                  <option value="">Saved projects…</option>
                  {drafts.data.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {file && (
              <div className="rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <FileAudio className="size-7 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold">{file.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {fmtTime(duration)} · {remainingTranscriptionCost(duration, chapters)}{" "}
                      transcription credits remaining · 1 credit per 5 minutes, rounded up
                    </p>
                  </div>
                </div>
                <Button className="mt-4" disabled={!!busy} onClick={run}>
                  <Sparkles className="size-4" />
                  {chapters.length ? "Resume transcription" : "Transcribe & split"}
                </Button>
              </div>
            )}
            {busy && busy !== "AI Yoto is thinking…" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p role="status" className="flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    {busy}
                  </p>
                  {busy.startsWith("Transcribing") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        stop.current = true;
                      }}
                    >
                      Pause after segment
                    </Button>
                  )}
                </div>
                {busy.startsWith("Transcribing") && <Progress value={progress} />}
              </div>
            )}
            {!file && !chapters.length && (
              <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
                <FolderOpen className="mx-auto mb-3 size-8" />
                Upload a long audio file or open a Yoto playlist to start.
              </div>
            )}
            {(file || draft) && (
              <div className="space-y-2">
                <Label htmlFor="project-title">Playlist title</Label>
                <Input
                  id="project-title"
                  value={title}
                  maxLength={120}
                  disabled={!!busy}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            )}
            {chapters.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">{chapters.length} chapters</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/public-playlists">Share &amp; library</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy || !undo.length}
                      onClick={undoLast}
                    >
                      <Undo2 className="size-4" />
                      Undo
                    </Button>
                    {needsOrganize && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={organizeChapters}
                      >
                        <Sparkles className="size-4" />
                        Auto-chapters · 1 credit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy || !title.trim()}
                      onClick={save}
                    >
                      <Save className="size-4" />
                      Save changes
                    </Button>
                    <Button
                      size="sm"
                      disabled={!!busy || !hasAudio || !connection.data.connected || !title.trim()}
                      onClick={publish}
                    >
                      <Send className="size-4" />
                      {draft?.yoto_card_id ? "Update on Yoto" : "Save to Yoto"}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-y py-3">
                  {(
                    [
                      ["number", "Number chapters"],
                      ["tidy", "Clean filenames"],
                      ["group", "Group by duration"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      size="sm"
                      variant="outline"
                      disabled={
                        !!busy || !!proposal || PLANS[membership.data.plan].rank < TOOL_RANK[id]
                      }
                      onClick={() => tool(id)}
                    >
                      {label}
                    </Button>
                  ))}
                  <Input
                    type="number"
                    aria-label="Group duration in minutes"
                    className="w-20"
                    min={1}
                    max={120}
                    value={targetMinutes}
                    onChange={(e) => setTargetMinutes(Number(e.target.value))}
                  />
                  <span className="text-xs text-muted-foreground">minutes · no credits</span>
                </div>
                <ol className="divide-y rounded-xl border">
                  {chapters.map((c, i) => (
                    <li
                      key={`${c.paths[0] ?? c.tracks?.[0]?.trackUrl}-${i}`}
                      className="space-y-3 p-4"
                    >
                      <div className="flex items-center gap-3">
                        {c.iconUrl || iconFor(c.icon) ? (
                          <img
                            src={c.iconUrl || iconFor(c.icon)}
                            alt={`Icon for ${c.title}`}
                            className="size-10 shrink-0 rounded border object-contain [image-rendering:pixelated]"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted text-sm font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <Input
                            aria-label={`Chapter ${i + 1} title`}
                            value={c.title}
                            disabled={!!busy}
                            maxLength={120}
                            onChange={(e) =>
                              setChapters(
                                chapters.map((ch, index) =>
                                  index === i ? { ...ch, title: e.target.value } : ch,
                                ),
                              )
                            }
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {fmtTime(c.end - c.start)}
                            {c.tracks?.length
                              ? ` · ${c.tracks.length} track${c.tracks.length > 1 ? "s" : ""} on Yoto`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Move up"
                            disabled={!!busy || i === 0}
                            onClick={() => move(i, -1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Move down"
                            disabled={!!busy || i === chapters.length - 1}
                            onClick={() => move(i, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete chapter"
                            disabled={!!busy || chapters.length < 2}
                            onClick={() => edit(chapters.filter((_, x) => x !== i))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                      {previews[c.paths[0] ?? ""] && (
                        <audio
                          controls
                          preload="none"
                          src={previews[c.paths[0] ?? ""]}
                          className="h-9 w-full max-w-md"
                          aria-label={`Chapter ${i + 1} audio`}
                        />
                      )}
                      {c.tracks?.[0]?.trackUrl.startsWith("https://archive.org/download/") && (
                        <audio
                          controls
                          preload="none"
                          src={c.tracks[0].trackUrl}
                          className="h-9 w-full max-w-md"
                          aria-label={`Chapter ${i + 1} audiobook`}
                        />
                      )}
                      {c.transcript && (
                        <details>
                          <summary className="cursor-pointer text-sm font-medium">
                            Transcript
                          </summary>
                          <Textarea
                            className="mt-3 min-h-24"
                            aria-label={`Chapter ${i + 1} transcript`}
                            value={c.transcript}
                            disabled={!!busy}
                            onChange={(e) =>
                              setChapters(
                                chapters.map((ch, index) =>
                                  index === i ? { ...ch, transcript: e.target.value } : ch,
                                ),
                              )
                            }
                          />
                        </details>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {i < chapters.length - 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!!busy}
                            onClick={() =>
                              edit([
                                ...chapters.slice(0, i),
                                mergeChapters([c, chapters[i + 1]!], c.title),
                                ...chapters.slice(i + 2),
                              ])
                            }
                          >
                            <Merge className="size-4" />
                            Merge with next
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy || !canUseAction(membership.data.plan, "icon")}
                          title={
                            canUseAction(membership.data.plan, "icon")
                              ? undefined
                              : "Pro plan or higher"
                          }
                          onClick={() => icon(i, false)}
                        >
                          <Sparkles className="size-4" />
                          AI icon · {AI_COSTS.icon}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy || !canUseAction(membership.data.plan, "animated")}
                          title={
                            canUseAction(membership.data.plan, "animated")
                              ? undefined
                              : "Pro Max plan"
                          }
                          onClick={() => icon(i, true)}
                        >
                          <Sparkles className="size-4" />
                          Animated · {AI_COSTS.animated}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </div>
        <Dialog
          open={yotoList !== null}
          onOpenChange={(o) => {
            if (!o) setYotoList(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open a Yoto playlist</DialogTitle>
              <DialogDescription>
                Choose one of your Make Your Own playlists to edit.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {yotoList?.map((p) => (
                <Button
                  key={p.playlistId}
                  variant="ghost"
                  className="h-auto w-full justify-start gap-3 py-2 text-left"
                  onClick={() => openFromYoto(p.playlistId)}
                >
                  {p.artwork ? (
                    <img src={p.artwork} alt="" className="size-10 rounded object-cover" />
                  ) : (
                    <FileAudio className="size-6" />
                  )}
                  <span className="min-w-0 truncate">{p.name}</span>
                </Button>
              ))}
              {yotoList?.length === 0 && (
                <p className="text-sm text-muted-foreground">No personal playlists found.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
