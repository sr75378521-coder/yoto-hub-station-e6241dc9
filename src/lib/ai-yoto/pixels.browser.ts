export async function pixelFile(pixels: { palette: string[]; frames: string[][] }, name: string): Promise<File> {
  if (pixels.frames.length > 1) {
    const { GIFEncoder } = await import('gifenc');
    const gif = GIFEncoder();
    const palette = pixels.palette.map(hex => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]);
    for (const frame of pixels.frames) gif.writeFrame(Uint8Array.from(frame.join(''), Number), 16, 16, { palette, delay: 250, repeat: 0 });
    gif.finish();
    return new File([new Uint8Array(gif.bytes())], `${name}.gif`, { type: 'image/gif' });
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const frame = pixels.frames[0];
  if (!ctx || !frame) throw new Error('Cannot create icon.');
  frame.forEach((row, y) => [...row].forEach((value, x) => { ctx.fillStyle = `#${pixels.palette[Number(value)]}`; ctx.fillRect(x, y, 1, 1); }));
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Cannot create icon.')), 'image/png'));
  return new File([blob], `${name}.png`, { type: 'image/png' });
}