import { describe, expect, test } from "bun:test";

import { FIELDS, layoutFields, paint, paletteFor, seedOf, swatch, type Rgb } from "./gradient";

/** A colour's strength, as the spread between its strongest and weakest channel. */
const spread = (colour: Rgb) => Math.max(...colour) - Math.min(...colour);
const strongest = (colour: Rgb) => ["red", "green", "blue"][colour.indexOf(Math.max(...colour))];

/** RGB bytes for a thumbnail of `counts` pixels of each colour. */
const thumbnail = (...parts: [Rgb, number][]) => new Uint8Array(parts.flatMap(([colour, count]) => Array.from({ length: count }, () => [...colour]).flat()));

describe("seedOf", () => {
  test("is the same for the same playlist and changes when it is renamed", () => {
    expect(seedOf("12\0Summer")).toBe(seedOf("12\0Summer"));
    expect(seedOf("12\0Summer")).not.toBe(seedOf("12\0Summer 2"));
    expect(seedOf("12\0Summer")).not.toBe(seedOf("13\0Summer"));
  });
});

describe("paletteFor", () => {
  test("gives the same colours every time, and different ones for another seed", () => {
    expect(paletteFor(7)).toEqual(paletteFor(7));
    expect(paletteFor(7)).not.toEqual(paletteFor(8));
  });

  test("is always a full set of rich colours: no greys, nothing near white or black", () => {
    for (let seed = 0; seed < 200; seed++) {
      const palette = paletteFor(seed);
      expect(palette).toHaveLength(FIELDS);
      for (const colour of palette) {
        expect(spread(colour)).toBeGreaterThan(55);
        expect(Math.max(...colour)).toBeGreaterThan(70);
        expect(Math.min(...colour)).toBeLessThan(200);
      }
    }
  });

  test("leads with colours sampled from art, made rich, and fills the rest from them", () => {
    const palette = paletteFor(7, [[150, 60, 55]]);
    expect(palette).toHaveLength(FIELDS);
    expect(strongest(palette[0]!)).toBe("red");
    expect(spread(palette[0]!)).toBeGreaterThan(150 - 55);
    // A pale sample keeps its hue but not its paleness.
    const [fromPastel] = paletteFor(7, [[205, 220, 245]]);
    expect(strongest(fromPastel!)).toBe("blue");
    expect(spread(fromPastel!)).toBeGreaterThan(80);
  });
});

describe("swatch", () => {
  test("is the colour a cover reads as, not the black or white most of it is", () => {
    const colour = swatch(thumbnail([[10, 10, 10], 200], [[250, 250, 250], 30], [[210, 40, 35], 26]));
    expect(strongest(colour!)).toBe("red");
    expect(spread(colour!)).toBeGreaterThan(120);
  });

  test("is nothing for art with no real colour", () => {
    expect(swatch(thumbnail([[20, 20, 20], 128], [[230, 230, 228], 124], [[200, 40, 40], 4]))).toBeNull();
  });
});

describe("layoutFields", () => {
  test("gives every colour one field, kept near enough to the cover to show", () => {
    const palette = paletteFor(3);
    const layout = layoutFields(3, palette);
    expect(layout).toEqual(layoutFields(3, palette));
    expect(layout.fields.map((field) => field.colour)).toEqual(palette);
    for (let seed = 0; seed < 200; seed++) {
      for (const field of layoutFields(seed, palette).fields) {
        expect(field.x).toBeGreaterThan(-0.05);
        expect(field.x).toBeLessThan(1.05);
        expect(field.y).toBeGreaterThan(-0.05);
        expect(field.y).toBeLessThan(1.05);
      }
    }
  });
});

describe("paint", () => {
  test("paints the same picture every time, grain included", () => {
    const layout = layoutFields(5, paletteFor(5));
    const first = paint(layout, 48);
    expect(first).toHaveLength(48 * 48 * 3);
    expect(paint(layout, 48)).toEqual(first);
    expect(paint(layoutFields(6, paletteFor(6)), 48)).not.toEqual(first);
  });

  test("puts visible grain over the colour", () => {
    const pixels = paint(layoutFields(5, paletteFor(5)), 48);
    // Neighbouring pixels of a smooth gradient differ by a level or two; grain makes it many.
    let change = 0;
    for (let i = 3; i < 48 * 3; i += 3) change += Math.abs(pixels[i]! - pixels[i - 3]!);
    expect(change / 47).toBeGreaterThan(6);
  });
});
