// Covers for albums with no art, the pure half: a record seen from above, its
// label in a colour of its own, lettered with the album name's first letter.
// What it looks like is picked from the album's identity (its artist credit and
// name, not its id), so an album keeps its cover through a rescan, and all its
// tracks share it. `cover.ts` renders and caches it.

import { seedOf, seeded } from "./gradient";
import { glyphs, UNITS_PER_EM } from "./label-glyphs";

/** The colour behind the record, which also shows through the spindle hole. */
const PETROL = "#0e2b2f";
/** Label colours: the label's own, and the darker one its band is printed in. */
const LABELS = [
  ["#ef5b34", "#7a1f0c"],
  ["#2f6f8f", "#0b2a3a"],
  ["#d9a032", "#5b3a06"],
  ["#3d7a5a", "#0e2b1f"],
  ["#8a4fb0", "#2a1238"],
  ["#c2414d", "#3b0d14"],
  ["#2b8c8c", "#08302f"],
  ["#5a6fd1", "#141c4a"],
] as const;
/** Groove radii from the outside in, out of a 100 wide cover. A record has the first two, three or four. */
const GROOVES = [40, 36.8, 33.6, 30.4];
/** The letter's size in cover units, and the baseline it sits on, just above the spindle hole. */
const LETTER = 14;
const BASELINE = 46;

/** A character the label can be lettered with. */
type Letter = keyof typeof glyphs;
const isLetter = (char: string): char is Letter => Object.hasOwn(glyphs, char);

/** A label before it is drawn. */
export type Label = {
  /** Radii of the faint rings cut into the record. */
  grooves: number[];
  colour: (typeof LABELS)[number];
  /** How far the label is turned, in degrees. */
  turn: number;
  letter: Letter;
};

/**
 * What a label is lettered with: the first letter or digit in the album's
 * name, as a capital, with any accent dropped ("élan" is E). "#" when the
 * name has neither, or only ones the font can't draw.
 */
export function letterOf(name: string): Letter {
  const first = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .match(/[\p{L}\p{N}]/u)?.[0];
  const letter = first?.toUpperCase().charAt(0) ?? "#";
  return isLetter(letter) ? letter : "#";
}

/** The label for an album, chosen by its artist credit and name. The same album always gets the same one. */
export function labelFor(artistCredit: string, name: string): Label {
  const next = seeded(seedOf(`${artistCredit}\0${name}`));
  return {
    grooves: GROOVES.slice(0, 2 + Math.floor(next() * 3)),
    colour: LABELS[Math.floor(next() * LABELS.length)],
    turn: Math.floor(next() * 360),
    letter: letterOf(name),
  };
}

/** Draws a label as an SVG `size` pixels square, laid out on a 100 by 100 grid. */
export function drawLabel({ grooves, colour: [main, dark], turn, letter }: Label, size: number): string {
  const glyph = glyphs[letter];
  const scale = LETTER / UNITS_PER_EM;
  // Centred on its ink rather than its advance, so a narrow 1 sits as square as a W.
  const x = 50 - ((glyph.left + glyph.right) / 2) * scale;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`,
    `<clipPath id="label"><circle cx="50" cy="50" r="22"/></clipPath>`,
    `<rect width="100" height="100" fill="${PETROL}"/>`,
    `<circle cx="50" cy="50" r="46" fill="#050f11"/>`,
    ...grooves.map((radius) => `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width=".6"/>`),
    // The band is clipped to the label, so its ends follow the label's edge.
    `<g transform="rotate(${turn} 50 50)" clip-path="url(#label)">`,
    `<circle cx="50" cy="50" r="22" fill="${main}"/>`,
    `<rect x="28" y="54" width="44" height="1.6" fill="${dark}" opacity=".55"/>`,
    `</g>`,
    `<path transform="translate(${x.toFixed(3)} ${BASELINE}) scale(${scale})" fill="#f3ead4" d="${glyph.d}"/>`,
    `<circle cx="50" cy="50" r="2.2" fill="${PETROL}"/>`,
    `</svg>`,
  ].join("");
}
