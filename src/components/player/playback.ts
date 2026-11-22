import { useQuery } from "@tanstack/react-query";

import type { WebTrack } from "~/server/api/routers/library";
import { audioTypes } from "~/server/library/audio";
import { decideWebStream, type StreamDecision, type TranscodeFormat } from "~/server/media/transcode";
import { useTRPC } from "~/trpc/react";
import { qualities, useCurrentTrack, usePlayer, type Normalise } from "./store";

const asked = new Map<string, boolean>();

/**
 * Whether this browser says it can play a file with this extension as it is.
 * Each kind is asked about once. The browser answers for the kind of file and
 * not for what is inside it, so it can say yes and be wrong (Apple Lossless
 * in an .m4a, in Chrome). The player bar catches those when they fail.
 */
function browserPlays(suffix: string) {
  // The server has no browser to ask, and no queue to play either.
  if (typeof Audio === "undefined") return true;
  let answer = asked.get(suffix);
  if (answer === undefined) {
    const type = audioTypes[suffix];
    answer = !!type && new Audio().canPlayType(type) !== "";
    asked.set(suffix, answer);
  }
  return answer;
}

/**
 * The playback preferences as they apply right now: the cap an admin put on
 * this account, the quality in force under it, and what the current track is
 * sent as. A track is converted when it is over the quality, when the browser
 * says it can't play that kind of file, or when it already failed to play as
 * it is. The player bar and every settings control read this one hook, so
 * what the bar plays and what the settings say can't drift apart.
 */
export function usePlayback() {
  const trpc = useTRPC();
  const cap = useQuery(trpc.account.playback.queryOptions()).data?.maxBitRate ?? null;
  const preferred = usePlayer((state) => state.quality);
  const format = usePlayer((state) => state.format);
  const unplayable = usePlayer((state) => state.unplayable);
  const track = useCurrentTrack();
  // A preference above the cap is the cap in practice, so that is what the settings show as chosen.
  const quality = cap !== null && (preferred === null || preferred > cap) ? cap : preferred;
  const convert = !!track && (unplayable.has(track.id) || !browserPlays(track.suffix));
  const sent = track ? decideWebStream(track, { maxBitRate: quality, format, convert }, cap) : null;
  return { cap, quality, format, track, sent };
}

/** The quality choices, best first. The ones above the account's cap can't be picked. */
export const qualityOptions = (cap: number | null) => [
  { value: null, label: "Original", disabled: cap !== null },
  ...qualities.map((rate) => ({ value: rate, label: `${rate} kbps`, disabled: cap !== null && rate > cap })),
];

export const normaliseOptions: { value: Normalise; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "track", label: "Per track" },
  { value: "album", label: "Per album" },
];

/** The formats a track can be converted to, with what each is good for and the type to ask the browser about. */
export const formatOptions: { value: TranscodeFormat; label: string; hint?: string; type: string }[] = [
  { value: "mp3", label: "MP3", hint: "Plays everywhere", type: "audio/mpeg" },
  { value: "opus", label: "Opus", hint: "Smaller at the same quality", type: 'audio/ogg; codecs="opus"' },
  { value: "aac", label: "AAC", type: "audio/aac" },
];

/** The one line that says what an account's cap is. */
export const capNote = (cap: number) => `Your account is limited to ${cap} kbps.`;

type Source = Pick<WebTrack, "suffix" | "bitRate">;

/** What a track is being sent as, in a word or two: "FLAC" for the file, "MP3 192" for a conversion. */
export function sentLabel(track: Source, sent: StreamDecision) {
  return sent.transcode ? `${sent.format.toUpperCase()} ${sent.bitRate}` : track.suffix.toUpperCase();
}

const kbps = new Intl.NumberFormat("en");

/** The same in a sentence: "FLAC 1,411 kbps, sent as it is" or "FLAC 1,411 kbps, converted to MP3 192 kbps". */
export function sentSummary(track: Source, sent: StreamDecision) {
  const source = track.bitRate ? `${track.suffix.toUpperCase()} ${kbps.format(track.bitRate)} kbps` : track.suffix.toUpperCase();
  return sent.transcode ? `${source}, converted to ${sentLabel(track, sent)} kbps` : `${source}, sent as it is`;
}

/**
 * How far to turn a track down so it plays about as loud as the rest, as a
 * share of the volume: 1 leaves it alone. Works from the ReplayGain the mode
 * asks for (the track's own, or its album's so an album keeps its quiet and
 * loud tracks), falling back to the other. It never goes above 1, because
 * turning a quiet track up could clip it.
 */
export function levelFor(track: Pick<WebTrack, "trackGain" | "albumGain">, mode: Normalise) {
  if (mode === "off") return 1;
  const gain = mode === "track" ? (track.trackGain ?? track.albumGain) : (track.albumGain ?? track.trackGain);
  // No gain covers a file without the tags, and a track queued before gains were read.
  return gain ? Math.min(1, 10 ** (gain / 20)) : 1;
}
