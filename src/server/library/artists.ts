// Working out who is credited on a track from what its tags say. Pure: the
// scanner feeds it tag values and, for joint names, what the library holds.

/** Lowercased, trimmed name: what makes two spellings the same artist. */
export const artistKey = (name: string) => name.trim().toLowerCase();

/** Who a track or album is credited to: the line to show, and each artist on it in order (never empty). */
export type Credit = { credit: string; names: string[] };

/**
 * Names that hold a separator and are still one artist. Short on purpose: an
 * "&" is only ever split on evidence (see `splitJoint`), so this is for the
 * names a comma or slash would cut, and duos whose halves also record alone.
 */
const wholeNames = [
  "AC/DC",
  "Axwell /\\ Ingrosso",
  "Tyler, The Creator",
  "Earth, Wind & Fire",
  "Crosby, Stills, Nash & Young",
  "Crosby, Stills & Nash",
  "Emerson, Lake & Palmer",
  "Blood, Sweat & Tears",
  "Peter, Paul and Mary",
  "Simon & Garfunkel",
  "Hall & Oates",
  "Above & Beyond",
  "Aly & Fila",
  "Dimitri Vegas & Like Mike",
  "Chase & Status",
  "Camo & Krooked",
  "Pola & Bryson",
  "Gerra & Stone",
  "Calyx & TeeBee",
  "Fred V & Grafix",
  "Matrix & Futurebound",
  "Ed Rush & Optical",
  "Dom & Roland",
  "Drumsound & Bassline Smith",
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const wholeNamePattern = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${wholeNames.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

/** A web address left in the artist tag by a download site. Never split. */
const urlPattern = /:\/\/|^www\.|^\S+\.(?:com|net|org|fm|io|co\.uk)(?:\/\S*)?$/i;

/** "A (feat. B)" and "A [ft. B]": the brackets go, the guest stays. */
const bracketedGuest = /\s*[([]\s*(?:feat\.?|ft\.?|featuring)\s+([^)\]]+)[)\]]/giu;

/**
 * Separators that only ever join artists: semicolons, slashes and commas
 * (a comma between digits is a number), and vs, feat, ft, featuring, w/ and
 * b2b as words of their own.
 */
const separators = /\s+(?:vs\.?|versus|feat\.?|ft\.?|featuring|w\/|b2b)\s+|\s*(?:[;；/／，、]|,(?!\d)|(?<!\d),)\s*/giu;

/** "A x B". Not "Lil Nas X", which has nothing after it, nor "Lil Nas X & Jack Harlow". */
const cross = /\s+[x×]\s+(?!(?:&|and)\s)/giu;

/** "&" and "and" between names. "& The ..." is the rest of a band's name. */
const conjunction = /\s+(?:&|and)\s+(?!the\s)/giu;

/** Hides each whole name behind a placeholder so no separator inside it is seen. `restore` puts them back. */
function maskWholeNames(text: string) {
  const kept: string[] = [];
  const masked = text.replace(wholeNamePattern, (name) => `\0${kept.push(name) - 1}\0`);
  const restore = (part: string) => part.replace(/\0(\d+)\0/g, (_, index: string) => kept[Number(index)]!);
  return { masked, restore };
}

/** Drops blanks and repeats (by `artistKey`), keeping the first spelling of each. */
function distinct(names: string[]) {
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const trimmed = name.trim();
    const key = artistKey(trimmed);
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

/**
 * The artists in a credit written as one string, split on the separators
 * that are never part of a name: "Total Science/FD", "Alok; Łaszewo",
 * "A feat. B", "A x B", "A vs B". "&" and "and" are left alone here, since
 * "Chase & Status" is one act and "Skrillex & Feid" is two: `splitJoint`
 * decides those against the library.
 */
export function splitCredit(credit: string): string[] {
  const text = credit.trim();
  if (!text || urlPattern.test(text)) return text ? [text] : [];
  const { masked, restore } = maskWholeNames(text);
  return distinct(
    masked
      .replace(bracketedGuest, ";$1")
      .split(separators)
      .flatMap((part) => part.split(cross))
      // "A, B, & C" leaves the last part starting with its "&".
      .map((part) => restore(part.replace(/^\s*(?:&|and)\s+/i, ""))),
  );
}

/**
 * Splits a joint name on "&" and "and", but only on evidence: a part has to
 * be an artist in its own right (`isArtist`) for the name to come apart.
 * "Skrillex & Feid" splits once Skrillex is known; "Low Steppa & Capri" stays
 * whole until one of them turns up alone. With several joins the longest known
 * run wins, so "Camo & Krooked & Mefjus" is Camo & Krooked, and Mefjus.
 * Returns the name alone when there is nothing to split.
 */
export function splitJoint(name: string, isArtist: (name: string) => boolean): string[] {
  const text = name.trim();
  if (urlPattern.test(text)) return [text];
  const { masked, restore } = maskWholeNames(text);
  // Split with a capture so each join is kept and a run can be put back as it was written.
  const pieces = masked.split(new RegExp(`(${conjunction.source})`, conjunction.flags));
  const tokens = pieces.filter((_, index) => index % 2 === 0);
  const joins = pieces.filter((_, index) => index % 2 === 1);
  const run = (from: number, to: number) =>
    tokens.slice(from, to).reduce((joined, token, index) => joined + joins[from + index - 1]! + token);
  // A placeholder stands for a whole name, which needs no evidence.
  const known = (part: string) => /^\0\d+\0$/.test(part) || isArtist(restore(part));

  const resolve = (from: number, to: number): string[] => {
    if (to - from <= 1) return tokens.slice(from, to);
    // The longest run of parts, short of all of them, that is an artist. Leftmost on a tie.
    for (let length = to - from - 1; length >= 1; length--) {
      for (let start = from; start + length <= to; start++) {
        if (known(run(start, start + length))) {
          return [...resolve(from, start), ...resolve(start, start + length), ...resolve(start + length, to)];
        }
      }
    }
    return [run(from, to)];
  };
  return distinct(resolve(0, tokens.length).map(restore));
}

/**
 * A credit from a tag pair: the single value (ARTIST, shown as written) and
 * the list (repeated ARTIST, ARTISTS, several TPE1 values).
 *  - A real list of two or more is taken as it stands, never split further.
 *  - Otherwise the one string is split with `splitCredit`. A list tag written
 *    as one string ("A;B") is the tagger's own list, so it is tried first.
 * Null when the tags name nobody.
 */
export function readCredit(single: string | undefined, list: string[] = []): Credit | null {
  const names = distinct(list);
  const shown = single?.trim();
  if (names.length > 1) {
    // With repeated values the single one is only the first of them, so the line to show is the list.
    return { credit: shown && artistKey(shown) !== artistKey(names[0]!) ? shown : names.join(", "), names };
  }
  const credit = shown || names[0];
  if (!credit) return null;
  const listed = names[0] ? splitCredit(names[0]) : [];
  const split = listed.length > 1 ? listed : splitCredit(credit);
  // A tag of nothing but separators names nobody else, so it stands as written.
  return { credit, names: split.length ? split : [credit] };
}

/** Artists whose names start with a number, so the number isn't mistaken for a position in a list. */
const numberedNames = /^(?:50 cent|2 chainz|21 savage|3 doors down|30 seconds to mars|100 gecs|2 unlimited|808 state|4 non blondes|5 seconds of summer|2 bad mice|4 hero|187 lockdown|2 live crew|10 years|12 stones)\b/i;

/**
 * What a file's name says about a track with no tags, for names in the
 * common "Artist - Title" form. A leading position ("07 - ", "065 ") and a
 * placeholder artist ("Unknown - ") are dropped first, and so is a position
 * in the middle ("Artist - Album - 04 - Title"). Without a spaced dash the
 * whole name is the title and no artist is guessed.
 */
export function fromFileName(name: string): { artist?: string; title: string } {
  // A position can come before or after the placeholder ("07 - Unknown - ", "Unknown - 07 - ").
  const withoutPosition = (text: string) => (numberedNames.test(text) ? text : text.replace(/^\d{1,3}(?:\s*[-.]\s+|\s+)(?=\S)/, ""));
  let rest = withoutPosition(name.trim());
  rest = withoutPosition(rest.replace(/^unknown(?: artist)?\s+-\s+/i, ""));
  // A position in the middle ("Artist - Album - 04 - Title") ends the lead: the artist is its first part, and the title is everything after the position.
  const middle = /^(.+?)\s+[-–]\s+\d{1,3}\s+[-–]\s+(\S.*)$/.exec(rest);
  if (middle) return { artist: middle[1]!.split(/\s+[-–]\s+/)[0]!.trim(), title: middle[2]!.trim() };
  const dash = rest.search(/\s+[-–]\s+/);
  if (dash <= 0) return { title: rest || name.trim() };
  const title = rest.slice(dash).replace(/^\s+[-–]\s+/, "").trim();
  return title ? { artist: rest.slice(0, dash).trim(), title } : { title: rest };
}
