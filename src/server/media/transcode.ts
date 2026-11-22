/** Formats the server can transcode to, with what ffmpeg needs for each. */
export const transcodeFormats = {
  mp3: { contentType: "audio/mpeg", args: ["-c:a", "libmp3lame", "-f", "mp3"] },
  opus: { contentType: "audio/ogg", args: ["-c:a", "libopus", "-f", "ogg"] },
  aac: { contentType: "audio/aac", args: ["-c:a", "aac", "-f", "adts"] },
} as const;

export type TranscodeFormat = keyof typeof transcodeFormats;

const isTranscodeFormat = (format: string): format is TranscodeFormat => Object.hasOwn(transcodeFormats, format);

/** What a track is sent as: the file on disk, or a conversion to `format` at `bitRate` kbps. */
export type StreamDecision = { transcode: false } | { transcode: true; format: TranscodeFormat; bitRate: number };

type Source = { suffix: string; bitRate: number | null };

/** The lowest of the limits that are set, in kbps, or null when none is. */
function lowestLimit(...limits: (number | null | undefined)[]) {
  const set = limits.filter((limit): limit is number => !!limit && limit > 0);
  return set.length ? Math.min(...set) : null;
}

/**
 * Whether to send a track as it is on disk or transcode it. A track is
 * transcoded when the client asks for another format, or when it is above the
 * lower of the client's `maxBitRate` and the user's cap. `format=raw` is
 * honoured only when the user has no cap, so a cap can't be sidestepped.
 */
export function decideStream(
  source: Source,
  request: { format?: string | null; maxBitRate?: number | null },
  userCap: number | null,
): StreamDecision {
  const cap = lowestLimit(request.maxBitRate, userCap);
  const wanted = request.format?.toLowerCase();

  if (wanted === "raw" && !userCap) return { transcode: false };

  const overCap = cap !== null && (source.bitRate === null || source.bitRate > cap);
  const otherFormat = wanted && isTranscodeFormat(wanted) && wanted !== source.suffix;
  if (!overCap && !otherFormat) return { transcode: false };

  return {
    transcode: true,
    format: wanted && isTranscodeFormat(wanted) ? wanted : "mp3",
    // Never transcode up: a 128k file capped at 320k stays at 128k.
    bitRate: Math.min(cap ?? 192, source.bitRate ?? cap ?? 192),
  };
}

/** Formats browsers play natively. Anything else is transcoded for the web player. */
export const browserPlayable: ReadonlySet<string> = new Set(["mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav"]);

/** What the web player asks for: the most it wants in kbps (none is the original), and the format to convert to when it has to. */
export type WebStreamPrefs = { maxBitRate?: number | null; format?: TranscodeFormat };

/**
 * `decideStream` for the web player, which unlike a Subsonic client only wants
 * another format when it has to have one. A file is sent as it is when the
 * browser plays its format and it is within the lower of `prefs.maxBitRate`
 * and the user's cap. Otherwise it is transcoded to `prefs.format` at that
 * limit, or at 320 when the only reason is a format the browser can't play.
 * The player runs this too, to know what it is being sent before it asks.
 */
export function decideWebStream(source: Source, prefs: WebStreamPrefs, userCap: number | null): StreamDecision {
  const limit = lowestLimit(prefs.maxBitRate, userCap);
  const withinLimit = limit === null || (source.bitRate !== null && source.bitRate <= limit);
  if (browserPlayable.has(source.suffix) && withinLimit) return { transcode: false };

  const target = limit ?? 320;
  // Never transcode up: a 128k file limited to 320k stays at 128k.
  return { transcode: true, format: prefs.format ?? "mp3", bitRate: Math.min(target, source.bitRate ?? target) };
}

/**
 * The address the web player loads a track from: `/api/stream/12` for the
 * file, with `q` (kbps) and `f` (format) when it is converted. `at` is how
 * many seconds in to start, for carrying on a play after a seek or a change
 * of quality; a converted stream starts there, a file is sent whole.
 */
export function webStreamUrl(trackId: number, sent: StreamDecision, at = 0) {
  const params = new URLSearchParams();
  if (sent.transcode) {
    params.set("q", String(sent.bitRate));
    params.set("f", sent.format);
  }
  if (at > 0) params.set("at", String(Math.round(at * 10) / 10));
  const query = params.toString();
  return `/api/stream/${trackId}${query ? `?${query}` : ""}`;
}

/** Reads `q`, `f` and `at` back out of a stream address. A value that makes no sense is left out. */
export function parseWebStreamParams(params: URLSearchParams): WebStreamPrefs & { offsetSeconds: number } {
  const maxBitRate = Number(params.get("q"));
  const format = params.get("f");
  const at = Number(params.get("at"));
  return {
    maxBitRate: Number.isInteger(maxBitRate) && maxBitRate > 0 ? maxBitRate : null,
    format: format !== null && isTranscodeFormat(format) ? format : undefined,
    offsetSeconds: Number.isFinite(at) && at > 0 ? at : 0,
  };
}
