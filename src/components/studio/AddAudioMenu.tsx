import { Circle, FolderUp, Languages, ListVideo, Square, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|flac|webm|opus)$/i;

function Row({ icon, title, sub, onClick, disabled }: { icon: React.ReactNode; title: string; sub: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 rounded-xl p-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">{icon}</span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="block text-sm text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}

/** "Add audio" menu like the Yoto app: files, browser recording, or a whole folder. */
export function AddAudioMenu({ onFiles }: { onFiles: (files: File[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("audio/") || AUDIO_RE.test(f.name));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (files.length) onFiles(files);
    else if (list?.length) toast.error("No audio files found.");
  };

  const toggleRecording = async () => {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        onFiles([new File([blob], `Recording ${new Date().toLocaleTimeString()}.${ext}`, { type: blob.type })]);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access was blocked.");
    }
  };

  return (
    <div className="space-y-1">
      <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <input
        ref={folderRef}
        type="file"
        hidden
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />
      <Row icon={<Volume2 className="size-6" />} title="Add audio files" sub="Upload audio from your device" onClick={() => fileRef.current?.click()} />
      <Row
        icon={recording ? <Square className="size-6 fill-current" /> : <Circle className="size-7 fill-current" />}
        title={recording ? "Stop recording" : "Create recording"}
        sub={recording ? "Recording… click to finish" : "Record audio in your browser"}
        onClick={toggleRecording}
      />
      <p className="px-2 pt-3 text-xs font-bold tracking-wider text-muted-foreground">ADVANCED</p>
      <Row icon={<FolderUp className="size-6" />} title="Import Playlist" sub="Create a playlist from a folder" onClick={() => folderRef.current?.click()} />
      <Row icon={<ListVideo className="size-6" />} title="Interactive Menu" sub="Design a menu of audio collections (coming soon)" disabled />
      <Row icon={<Languages className="size-6" />} title="Multi-Language Playlist" sub="Add a playlist in multiple languages (coming soon)" disabled />
    </div>
  );
}

export function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(a.duration) ? a.duration : null); };
    a.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    a.src = url;
  });
}
