/** How loudness is evened out: not at all, each track to the same level, or each album as a whole. */
export type Normalise = "off" | "track" | "album";

/**
 * How far to turn a track down so it plays about as loud as the rest, as a
 * share of the volume: 1 leaves it alone. Works from the ReplayGain the mode
 * asks for (the track's own, or its album's so an album keeps its quiet and
 * loud tracks), falling back to the other. It never goes above 1, because
 * turning a quiet track up could clip it. Shared by the website and the app.
 */
export function levelFor(track: { trackGain: number | null; albumGain: number | null }, mode: Normalise) {
  if (mode === "off") return 1;
  const gain = mode === "track" ? (track.trackGain ?? track.albumGain) : (track.albumGain ?? track.trackGain);
  // No gain covers a file without the tags, and a track queued before gains were read.
  return gain ? Math.min(1, 10 ** (gain / 20)) : 1;
}
