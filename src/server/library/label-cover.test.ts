import { describe, expect, test } from "bun:test";
import sharp from "sharp";

import { drawLabel, labelFor, letterOf } from "./label-cover";

describe("labelFor", () => {
  test("gives an album the same label every time, and other albums others", () => {
    expect(labelFor("Coda Park", "Night Bus Home")).toEqual(labelFor("Coda Park", "Night Bus Home"));
    expect(labelFor("Coda Park", "Night Bus Home")).not.toEqual(labelFor("Coda Park", "Night Bus Home II"));
    expect(labelFor("Coda Park", "Night Bus Home")).not.toEqual(labelFor("Pale Rooms", "Night Bus Home"));
  });

  test("uses every colour and two to four grooves across a library", () => {
    const labels = Array.from({ length: 200 }, (_, i) => labelFor("Artist", `Album ${i}`));
    expect(new Set(labels.map((label) => label.colour)).size).toBe(8);
    expect(new Set(labels.map((label) => label.grooves.length))).toEqual(new Set([2, 3, 4]));
  });
});

describe("letterOf", () => {
  test("is the name's first letter or digit as a capital, with accents dropped", () => {
    expect(letterOf("night bus home")).toBe("N");
    expect(letterOf("(4) Seasons")).toBe("4");
    expect(letterOf("élan")).toBe("E");
    expect(letterOf("øya")).toBe("Ø");
  });

  test("is # when there is no letter or digit the font can draw", () => {
    expect(letterOf("")).toBe("#");
    expect(letterOf("!!!")).toBe("#");
    expect(letterOf("東京")).toBe("#");
  });
});

describe("drawLabel", () => {
  test("draws a record on petrol, its label in the label's colour and lettered in ivory", async () => {
    const svg = drawLabel({ grooves: [40, 36.8], colour: ["#ef5b34", "#7a1f0c"], turn: 0, letter: "N" }, 200);
    const { data, info } = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([200, 200]);
    const pixels = Array.from({ length: data.length / 3 }, (_, i) => `#${[...data.subarray(i * 3, i * 3 + 3)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
    // Points on a 100 by 100 grid, as the label is laid out.
    const at = (x: number, y: number) => pixels[y * 2 * info.width + x * 2];
    expect(at(1, 1)).toBe("#0e2b2f");
    expect(at(50, 23)).toBe("#050f11");
    expect(at(50, 62)).toBe("#ef5b34");
    expect(at(50, 50)).toBe("#0e2b2f");
    expect(pixels).toContain("#f3ead4");
  });
});
