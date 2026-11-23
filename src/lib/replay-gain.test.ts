import { describe, expect, test } from "bun:test";

import { levelFor } from "./replay-gain";

describe("levelFor", () => {
  const loud = { trackGain: -6, albumGain: -9 };

  test("turns a loud track down by its own gain, or its album's when asked", () => {
    expect(levelFor(loud, "track")).toBeCloseTo(10 ** (-6 / 20));
    expect(levelFor(loud, "album")).toBeCloseTo(10 ** (-9 / 20));
  });

  test("falls back to the other gain when the one asked for is missing", () => {
    expect(levelFor({ trackGain: null, albumGain: -9 }, "track")).toBeCloseTo(10 ** (-9 / 20));
    expect(levelFor({ trackGain: -6, albumGain: null }, "album")).toBeCloseTo(10 ** (-6 / 20));
  });

  test("never turns a track up, and leaves one alone when off or untagged", () => {
    expect(levelFor({ trackGain: 4, albumGain: 4 }, "track")).toBe(1);
    expect(levelFor(loud, "off")).toBe(1);
    expect(levelFor({ trackGain: null, albumGain: null }, "track")).toBe(1);
  });
});
