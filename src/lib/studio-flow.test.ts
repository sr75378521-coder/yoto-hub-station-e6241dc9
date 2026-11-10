import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { setWaitForButton, waitsForButton } from "./studio-flow";

describe("wait for a button at the end of a track", () => {
  test("waiting disables automatic playback and audio loops", () => {
    assert.deepEqual(setWaitForButton(true), { auto_advance: false, loop_audio: false });
    assert.equal(waitsForButton(setWaitForButton(true)), true);
  });
  test("turning waiting off allows automatic playback again", () => {
    assert.deepEqual(setWaitForButton(false), { auto_advance: true, loop_audio: false });
    assert.equal(waitsForButton(setWaitForButton(false)), false);
  });
});
