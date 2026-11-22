// Generated playlist covers, the pure half: a seed and a few sampled colours
// go in, pixels come out. A cover is a few large soft colour fields blended
// into each other with film grain over the top. Nothing here is random: the
// same seed and colours always paint the same picture, so covers can be
// cached. `cover.ts` does the reading, sampling and caching around it.

/** An sRGB colour, 0 to 255 per channel. */
export type Rgb = readonly [number, number, number];

/** A colour as lightness (0 to 1), chroma (0 to about 0.3) and hue in degrees: OKLCH. */
type Lch = { l: number; c: number; h: number };

/** How many colours a cover is painted from, one field each. */
export const FIELDS = 4;

// What "rich rather than pastel" means in numbers: never washed out, never grey.
const LIGHTNESS = [0.42, 0.78] as const;
const CHROMA = [0.12, 0.2] as const;
/** Below this a colour is a grey, and its hue means nothing. */
const GREY = 0.035;

/** A stable 32-bit seed from text (FNV-1a). */
export function seedOf(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A seeded stream of numbers from 0 up to 1 (mulberry32), standing in for Math.random. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value: number, [low, high]: readonly [number, number]) => Math.min(high, Math.max(low, value));
const toLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (value: number) => (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

/** sRGB to OKLab, the space colours are mixed in so blends keep their strength instead of going muddy. */
function toLab([red, green, blue]: Rgb): [number, number, number] {
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to linear-light RGB, which may fall outside 0 to 1 for colours a screen can't show. */
function labToLinear(lightness: number, a: number, b: number): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function toLch(colour: Rgb): Lch {
  const [l, a, b] = toLab(colour);
  return { l, c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI };
}

/** OKLCH to sRGB. A colour too strong for the screen gives up chroma, never hue. */
function fromLch({ l, c, h }: Lch): Rgb {
  const angle = (h * Math.PI) / 180;
  for (let chroma = c; ; chroma *= 0.92) {
    const linear = labToLinear(l, chroma * Math.cos(angle), chroma * Math.sin(angle));
    if (chroma < 0.005 || linear.every((value) => value >= -0.001 && value <= 1.001)) {
      const [r, g, b] = linear.map((value) => Math.round(fromLinear(clamp(value, [0, 1])) * 255));
      return [r!, g!, b!];
    }
  }
}

/** Pulls a colour into the rich range, keeping its hue. */
const rich = ({ l, c, h }: Lch): Lch => ({ l: clamp(l, LIGHTNESS), c: clamp(c, CHROMA), h });

/**
 * The colour a cover reads as, from its pixels (RGB bytes of a small
 * thumbnail): the average of the hue that carries most of its colour. A
 * black sleeve with a red logo is red. Null when there is no real colour.
 */
export function swatch(pixels: Uint8Array): Rgb | null {
  const bins = Array.from({ length: 12 }, () => ({ weight: 0, l: 0, a: 0, b: 0 }));
  let coloured = 0;
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const [l, a, b] = toLab([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
    const chroma = Math.hypot(a, b);
    if (chroma < GREY) continue;
    coloured++;
    const hue = (Math.atan2(b, a) * 180) / Math.PI;
    const bin = bins[Math.floor((((hue % 360) + 360) % 360) / 30) % 12]!;
    // Squared, so the strongest pixels of a hue set its colour and the washed-out ones barely count.
    const weight = chroma ** 2;
    bin.weight += weight;
    bin.l += l * weight;
    bin.a += a * weight;
    bin.b += b * weight;
  }
  // A few stray tinted pixels on a grey sleeve don't make it a colour.
  if (coloured < pixels.length / 3 / 20) return null;
  const best = bins.reduce((top, bin) => (bin.weight > top.weight ? bin : top));
  const [r, g, b] = labToLinear(best.l / best.weight, best.a / best.weight, best.b / best.weight).map((value) =>
    Math.round(fromLinear(clamp(value, [0, 1])) * 255),
  );
  return [r!, g!, b!];
}

/**
 * The colours a cover is painted from, always `FIELDS` of them and always
 * rich. `sampled` are colours taken from the playlist's album art; they lead,
 * and what they leave empty is filled with neighbours of them. With no art
 * the seed picks a hue and its neighbours, plus one from across the wheel.
 */
export function paletteFor(seed: number, sampled: readonly Rgb[] = []): Rgb[] {
  const next = seeded(seed);
  // Art is mostly duller than a cover wants, and covers by one artist sit at one brightness: lift the chroma and spread them out.
  const spread = [0, 0.1, -0.1, 0.05];
  const anchors = sampled.slice(0, FIELDS).map((colour, index) => {
    const { l, c, h } = toLch(colour);
    return rich({ l: clamp(l, LIGHTNESS) + spread[index % spread.length]!, c: c * 1.5, h });
  });
  if (!anchors.length) anchors.push({ l: 0.62, c: 0.17, h: next() * 360 });

  const palette = [...anchors];
  // Filled in turn: a lighter neighbour, a deeper one, then a mid tone.
  const lightness = [0.72, 0.46, 0.58];
  for (let i = 0; palette.length < FIELDS; i++) {
    const from = anchors[i % anchors.length]!;
    const side = i % 2 ? -1 : 1;
    // One colour alone gets an answer from across the wheel; otherwise the art's own colours carry it.
    const across = anchors.length === 1 && palette.length === FIELDS - 1;
    const turn = across ? 150 + next() * 60 : side * (28 + next() * 34);
    palette.push(rich({ l: lightness[i % lightness.length]! + (next() - 0.5) * 0.08, c: from.c, h: from.h + turn }));
  }
  return palette.map(fromLch);
}

/** One soft colour field: where its centre is and how far it reaches, as fractions of the cover's width. */
export type Field = { x: number; y: number; reach: number; colour: Rgb };

/** A cover before it is painted. */
export type Layout = {
  fields: Field[];
  /** A slow wave that bends the fields, so they flow instead of sitting as round blobs. */
  wave: { amount: number; turns: number; phaseX: number; phaseY: number };
  /** Seeds the grain. */
  grain: number;
};

/**
 * Lays the palette's colours out as fields. They are dealt around the centre
 * a quarter turn apart, so no two start on top of each other and every colour
 * gets a share of the cover; the seed turns the whole arrangement and varies
 * how far out and how wide each one is.
 */
export function layoutFields(seed: number, palette: readonly Rgb[]): Layout {
  const next = seeded(seed ^ 0x9e3779b9);
  const start = next() * Math.PI * 2;
  const fields = palette.map((colour, index) => {
    const angle = start + (index / palette.length) * Math.PI * 2 + (next() - 0.5) * 0.9;
    const distance = 0.22 + next() * 0.3;
    return { x: 0.5 + Math.cos(angle) * distance, y: 0.5 + Math.sin(angle) * distance, reach: 0.3 + next() * 0.2, colour };
  });
  return {
    fields,
    wave: { amount: 0.05 + next() * 0.06, turns: 0.7 + next() * 0.7, phaseX: next(), phaseY: next() },
    grain: Math.floor(next() * 4294967296),
  };
}

/** How strong the grain is, as a share of full brightness. Enough to see at a glance, not enough to hide the colour. */
const GRAIN = 0.11;

/**
 * Paints a layout as `size` by `size` RGB bytes. Every pixel is a mix of all
 * the fields, each weighted by how close it is, so they melt into each other
 * with no edges. Grain goes on last: the same amount on all three channels,
 * like film, and a touch softer in the darkest and lightest parts.
 */
export function paint(layout: Layout, size: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 3);
  const fields = layout.fields.map((field) => {
    const lab = toLab(field.colour);
    return { ...field, lab, chroma: Math.hypot(lab[1], lab[2]) };
  });
  const { amount, turns, phaseX, phaseY } = layout.wave;
  const noise = seeded(layout.grain);
  const tau = Math.PI * 2;

  for (let row = 0; row < size; row++) {
    const v = (row + 0.5) / size;
    for (let column = 0; column < size; column++) {
      const u = (column + 0.5) / size;
      const x = u + amount * Math.sin(tau * (v * turns + phaseX));
      const y = v + amount * Math.sin(tau * (u * turns + phaseY));

      let total = 0;
      let l = 0;
      let a = 0;
      let b = 0;
      let chroma = 0;
      for (const field of fields) {
        const weight = Math.exp(-((x - field.x) ** 2 + (y - field.y) ** 2) / (2 * field.reach ** 2)) ** 2 + 1e-6;
        total += weight;
        l += field.lab[0] * weight;
        a += field.lab[1] * weight;
        b += field.lab[2] * weight;
        chroma += field.chroma * weight;
      }
      // Two colours from opposite sides of the wheel average towards grey. Most of the strength they had is put
      // back, easing off to nothing where they cancel exactly, so the hue turns over there without a hard line.
      const mixed = Math.hypot(a, b);
      const kept = Math.min(1, mixed / chroma);
      const lift = mixed > 0 ? (chroma * (1 - (1 - kept) ** 2.5)) / mixed : 1;
      const linear = labToLinear(l / total, (a / total) * lift, (b / total) * lift);

      // Two draws added together bunch around the middle, the way grain does.
      const speck = (noise() + noise() - 1) * GRAIN * (0.6 + 0.4 * Math.sin(Math.PI * clamp(l / total, [0, 1])));
      const at = (row * size + column) * 3;
      for (let channel = 0; channel < 3; channel++) {
        pixels[at + channel] = Math.round(clamp(fromLinear(clamp(linear[channel]!, [0, 1])) + speck, [0, 1]) * 255);
      }
    }
  }
  return pixels;
}
