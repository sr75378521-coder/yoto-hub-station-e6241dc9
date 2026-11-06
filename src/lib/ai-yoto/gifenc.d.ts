declare module 'gifenc' {
  export function GIFEncoder(): {
    writeFrame(pixels: Uint8Array, width: number, height: number, options: { palette: number[][]; delay: number; repeat: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}