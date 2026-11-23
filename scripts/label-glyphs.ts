// Writes src/server/library/label-glyphs.ts: the outlines of the characters a
// generated album cover can be lettered with, taken from Big Shoulders Display
// ExtraBold. Covers draw them as plain SVG paths, so no server needs the font
// installed and nothing reads the font file at runtime.
//   bun scripts/label-glyphs.ts
// Only needed again to change the font or the characters.
import { readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";

const FONT = "src/server/library/fonts/BigShouldersDisplay-ExtraBold.ttf";
const OUT = "src/server/library/label-glyphs.ts";
/** Digits, capitals, the capitals that have no accent to fold away, and "#" for names with none of them. */
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZÆÐØÞĐĦŁŊŒ#";

const bytes = readFileSync(FONT);
const font = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const round = (value: number) => Math.round(value * 10) / 10;

const entries = [...CHARS].map((char) => {
  const glyph = font.charToGlyph(char);
  if (glyph.index === 0) throw new Error(`The font has no ${char}.`);
  const box = glyph.getBoundingBox();
  // Drawn one em to the unit, the outline is in font units with y pointing down from the baseline, as SVG has it.
  const d = glyph.getPath(0, 0, font.unitsPerEm).toPathData(1);
  return `  ${JSON.stringify(char)}: { d: ${JSON.stringify(d)}, left: ${round(box.x1)}, right: ${round(box.x2)} },`;
});

writeFileSync(
  OUT,
  [
    "// Written by scripts/label-glyphs.ts from fonts/BigShouldersDisplay-ExtraBold.ttf",
    "// (SIL Open Font License, fonts/OFL.txt). Run that again rather than editing this.",
    "",
    "/** A character's outline as SVG path data, in font units with y pointing down from the baseline, and where its ink starts and ends across. */",
    "export type Glyph = { d: string; left: number; right: number };",
    "",
    "/** Font units to the em. */",
    `export const UNITS_PER_EM = ${font.unitsPerEm};`,
    "",
    "export const glyphs = {",
    ...entries,
    "} satisfies Record<string, Glyph>;",
    "",
  ].join("\n"),
);
console.log(`Wrote ${entries.length} glyphs to ${OUT}.`);
