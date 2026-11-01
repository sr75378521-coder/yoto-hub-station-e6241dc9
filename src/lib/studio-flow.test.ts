import { describe, expect, test } from "bun:test";
import { setWaitForButton, waitsForButton } from "./studio-flow";

describe("wait for a button at the end of a track", () => {
  test("waiting disables automatic playback and audio loops", () => {
    expect(setWaitForButton(true)).toEqual({ auto_advance: false, loop_audio: false });
    expect(waitsForButton(setWaitForButton(true))).toBe(true);
  });
  test("turning waiting off allows automatic playback again", () => {
    expect(setWaitForButton(false)).toEqual({ auto_advance: true, loop_audio: false });
    expect(waitsForButton(setWaitForButton(false))).toBe(false);
  });
});