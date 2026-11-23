/**
 * Formats the server can transcode to, with what ffmpeg needs for each.
 * `maxBitRate` is the most each is encoded at, in kbps: MP3's own ceiling,
 * and what libopus takes for one channel (it refuses a mono file above that).
 * MP3 and Opus bring a high sample rate down by themselves; AAC would keep
 * 96 kHz, which not every browser's decoder takes, so it is held to 48.
 */
export const transcodeFormats = {
  mp3: { contentType: "audio/mpeg", maxBitRate: 320, args: ["-c:a", "libmp3lame", "-f", "mp3"] },
  opus: { contentType: "audio/ogg", maxBitRate: 256, args: ["-c:a", "libopus", "-f", "ogg"] },
  aac: {
    contentType: "audio/aac",
    maxBitRate: 320,
    args: ["-c:a", "aac", "-af", "aformat=sample_rates=48000|44100|32000|24000|22050|16000|12000|11025|8000", "-f", "adts"],
  },
} as const;

export type TranscodeFormat = keyof typeof transcodeFormats;

const isTranscodeFormat = (format: string): format is TranscodeFormat => Object.hasOwn(transcodeFormats, format);

/**
 * The ffmpeg arguments that convert a file to `format` at `bitRate` kbps and
 * write it to standard output, starting `offsetSeconds` in. Only the first
 * audio stream is taken, so cover art in the file is left behind.
 */
export function transcodeArgs(
  input: string,
  options: { format: TranscodeFormat; bitRate: number; offsetSeconds?: number; preInputArgs?: string[] },
) {
  return [
    "-v", "error", "-nostdin",
    ...(options.preInputArgs ?? []),
    ...(options.offsetSeconds ? ["-ss", String(options.offsetSeconds)] : []),
    "-i", input,
    "-map", "0:a:0", "-vn",
    "-b:a", `${options.bitRate}k`,
    ...transcodeFormats[options.format].args,
    "pipe:1",
  ];
}

/** What a track is sent as: the file on disk, or a conversion to `format` at `bitRate` kbps. */
export type StreamDecision = { transcode: false } | { transcode: true; format: TranscodeFormat; bitRate: number };

type Source = { suffix: string; bitRate: number | null };

/**
 * The bitrate to convert at, in kbps: `target`, but never above the source (a
 * 128k file limited to 320k stays at 128k) or the most the format is encoded at.
 */
const bitRateFor = (format: TranscodeFormat, target: number, source: Pick<Source, "bitRate">) =>
  Math.min(target, source.bitRate ?? target, transcodeFormats[format].maxBitRate);

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

  const format = wanted && isTranscodeFormat(wanted) ? wanted : "mp3";
  return { transcode: true, format, bitRate: bitRateFor(format, cap ?? 192, source) };
}

/**
 * What the web player asks for: the most it wants in kbps (none is the
 * original), the format to convert to when it has to, and `convert` when the
 * file has to be converted whatever its bitrate, because the browser can't
 * play it as it is.
 */
export type WebStreamPrefs = { maxBitRate?: number | null; format?: TranscodeFormat; convert?: boolean };

/**
 * `decideStream` for the web player, which unlike a Subsonic client only wants
 * another format when it has to have one. A file is sent as it is unless the
 * player says the browser can't play it (`prefs.convert`), or it is above the
 * lower of `prefs.maxBitRate` and the user's cap. Then it is transcoded to
 * `prefs.format` at that limit, or at 320 when the only reason is that the
 * browser can't play it.
 *
 * Only the browser knows what it plays, so the player decides and the server
 * follows: the player runs this with what the browser told it, puts the
 * outcome in the address (`webStreamUrl`), and the server runs it again on
 * what the address says. The two agree, except that the server uses the cap
 * as it is now.
 */
export function decideWebStream(source: Pick<Source, "bitRate">, prefs: WebStreamPrefs, userCap: number | null): StreamDecision {
  const limit = lowestLimit(prefs.maxBitRate, userCap);
  const withinLimit = limit === null || (source.bitRate !== null && source.bitRate <= limit);
  if (!prefs.convert && withinLimit) return { transcode: false };

  const format = prefs.format ?? "mp3";
  return { transcode: true, format, bitRate: bitRateFor(format, limit ?? 320, source) };
}

/**
 * The address the web player loads a track from: `/api/stream/12` for the
 * file, with `q` (kbps) and `f` (format) when it is converted. `at` is how
 * many seconds in to start, for carrying on a play after a seek or a change
 * of quality; a converted stream starts there, a file is sent whole. `play`
 * says which it is: `"on"`, the same play carrying on, always sends `at`
 * (even from the start, after a seek back to it), so it isn't logged again;
 * `"new"`, a new play, sends `start` when it starts part way in (from a point
 * on a row's waveform), so it is logged as the play it is.
 */
export function webStreamUrl(trackId: number, sent: StreamDecision, at = 0, play: "new" | "on" = "new") {
  const params = new URLSearchParams();
  if (sent.transcode) {
    params.set("q", String(sent.bitRate));
    params.set("f", sent.format);
  }
  const seconds = String(Math.max(0, Math.round(at * 10) / 10));
  if (play === "on") params.set("at", seconds);
  else if (at > 0) params.set("start", seconds);
  const query = params.toString();
  return `/api/stream/${trackId}${query ? `?${query}` : ""}`;
}

/**
 * Reads `q`, `f` and `at` (or `start`) back out of a stream address. A format
 * in the address means the player decided on a conversion, so it is one. A
 * value that makes no sense is left out. `carriesOn` is true for `at`: the
 * same play asked for again, from the start or further in.
 */
export function parseWebStreamParams(params: URLSearchParams): WebStreamPrefs & { offsetSeconds: number; carriesOn: boolean } {
  const maxBitRate = Number(params.get("q"));
  const asked = params.get("f");
  const format = asked !== null && isTranscodeFormat(asked) ? asked : undefined;
  const at = Number(params.get("at") ?? params.get("start"));
  return {
    maxBitRate: Number.isInteger(maxBitRate) && maxBitRate > 0 ? maxBitRate : null,
    format,
    convert: format !== undefined,
    offsetSeconds: Number.isFinite(at) && at > 0 ? at : 0,
    carriesOn: params.has("at") && Number.isFinite(at) && at >= 0,
  };
}
