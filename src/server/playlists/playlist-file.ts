/** A playlist file found in a library: where it is, and the tracks it lists, each as a path inside the library. */
export type PlaylistFile = { relPath: string; entries: string[] };

export const playlistFilePattern = /\.m3u8?$/i;

/** A playlist file's text. `.m3u8` is UTF-8; an older `.m3u` that isn't is read as Latin-1. */
export function decodePlaylistFile(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Percent-encoding undone, or the text as it was when it isn't valid encoding ("18% (Original Mix)"). */
function unescaped(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** A path's parts with "." and ".." worked out. Null when ".." climbs out of the top. */
function partsOf(filePath: string) {
  const parts: string[] = [];
  for (const part of filePath.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part !== "..") parts.push(part);
    else if (parts.pop() === undefined) return null;
  }
  return parts;
}

/** How paths are compared: letter case and the way accents are composed don't count. */
const fold = (text: string) => text.normalize("NFC").toLowerCase();

/**
 * Reads an `.m3u` or `.m3u8` playlist and returns what it lists, in order, as
 * paths inside the library. `dir` is the folder the playlist file is in,
 * inside the library ("" for the top), and `libraryPath` is where the library
 * is on disk.
 *
 * An entry is a path relative to the playlist's own folder, an absolute path,
 * or a `file://` URL, with either kind of slash. Comments (`#EXTINF` and the
 * rest) and blank lines are skipped, and so is anything that points outside
 * the library: another disk, a web address, or ".." past the top.
 */
export function parsePlaylistFile(text: string, where: { dir: string; libraryPath: string }): string[] {
  const root = partsOf(where.libraryPath) ?? [];
  const entries: string[] = [];
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const url = /^file:\/\/(?:localhost)?(\/.*)$/i.exec(line);
    // Any other address is a stream somewhere else. Two letters or more, so "C:\" isn't taken for one.
    if (!url && /^[a-z][a-z0-9+.-]+:\/\//i.test(line)) continue;
    const target = url ? unescaped(url[1]!) : line;

    // "/music/a.mp3", "C:\music\a.mp3", and "/C:/music/a.mp3" out of a URL.
    if (/^([\\/]|[a-z]:[\\/])/i.test(target)) {
      const parts = partsOf(target);
      const inside = parts && parts.length > root.length && root.every((part, i) => fold(part) === fold(parts[i]!));
      if (inside) entries.push(parts.slice(root.length).join("/"));
    } else {
      const parts = partsOf(`${where.dir}/${target}`);
      if (parts?.length) entries.push(parts.join("/"));
    }
  }
  return entries;
}

/**
 * Makes the lookup from a playlist entry to the scanned track it means. An
 * exact path wins. Failing that, letter case and the way accents are composed
 * are ignored (macOS stores "é" as two characters where most playlist writers
 * use one), and an entry is tried with percent-encoding undone, which some
 * writers use for plain paths too.
 */
export function trackFinder(tracks: { id: number; relPath: string }[]) {
  const exact = new Map(tracks.map((item) => [item.relPath, item.id]));
  const folded = new Map(tracks.map((item) => [fold(item.relPath), item.id]));
  const find = (entry: string) => exact.get(entry) ?? folded.get(fold(entry));
  return (entry: string) => find(entry) ?? (entry.includes("%") ? find(unescaped(entry)) : undefined);
}
