export type EndMode = { auto_advance: boolean; loop_audio: boolean };

export function waitsForButton(track: EndMode) {
  return !track.auto_advance && !track.loop_audio;
}

export function setWaitForButton(enabled: boolean): EndMode {
  return { auto_advance: !enabled, loop_audio: false };
}
