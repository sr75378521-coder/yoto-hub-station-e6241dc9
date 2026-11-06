import wasmAsset from '@/assets/ffmpeg-core.wasm.asset.json';
import workerSource from '@/lib/ffmpeg-worker.bundled.js?raw';
import type { FFmpeg } from '@ffmpeg/ffmpeg';

export async function openAudio(file: File) {
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
  const workerURL = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  const ff: FFmpeg = new FFmpeg();
  const [coreURL, wasmURL] = await Promise.all([toBlobURL('/ffmpeg-core.js', 'text/javascript'), toBlobURL(wasmAsset.url, 'application/wasm')]);
  try {
    await ff.load({ classWorkerURL: workerURL, coreURL, wasmURL });
    const input = `input.${file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'audio'}`;
    await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    return {
      async clip(start: number, duration: number) {
        const code = await ff.exec(['-ss', String(start), '-i', input, '-t', String(duration), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', 'clip.wav']);
        if (code !== 0) throw new Error('Could not prepare this audio segment.');
        const bytes = await ff.readFile('clip.wav');
        if (typeof bytes === 'string') throw new Error('Invalid audio output');
        const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
        await ff.deleteFile('clip.wav');
        return blob;
      },
      close() { ff.terminate(); [workerURL, coreURL, wasmURL].forEach(url => URL.revokeObjectURL(url)); },
    };
  } catch (error) { ff.terminate(); [workerURL, coreURL, wasmURL].forEach(url => URL.revokeObjectURL(url)); throw error; }
}

export async function fileDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => { if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration); else reject(new Error('Could not read audio duration.')); audio.removeAttribute('src'); };
      audio.onerror = () => reject(new Error('This audio format cannot be read. Try converting it to MP3 first.'));
      audio.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}
