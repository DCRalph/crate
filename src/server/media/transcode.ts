/** Formats the server can transcode to, with what ffmpeg needs for each. */
export const transcodeFormats = {
  mp3: { contentType: "audio/mpeg", args: ["-c:a", "libmp3lame", "-f", "mp3"] },
  opus: { contentType: "audio/ogg", args: ["-c:a", "libopus", "-f", "ogg"] },
  aac: { contentType: "audio/aac", args: ["-c:a", "aac", "-f", "adts"] },
} as const;

export type TranscodeFormat = keyof typeof transcodeFormats;

const isTranscodeFormat = (format: string): format is TranscodeFormat => format in transcodeFormats;

/**
 * Whether to send a track as it is on disk or transcode it. A track is
 * transcoded when the client asks for another format, or when it is above the
 * lower of the client's `maxBitRate` and the user's cap. `format=raw` is
 * honoured only when the user has no cap, so a cap can't be sidestepped.
 */
export function decideStream(
  source: { suffix: string; bitRate: number | null },
  request: { format?: string | null; maxBitRate?: number | null },
  userCap: number | null,
): { transcode: false } | { transcode: true; format: TranscodeFormat; bitRate: number } {
  const limits = [request.maxBitRate, userCap].filter((limit): limit is number => !!limit && limit > 0);
  const cap = limits.length ? Math.min(...limits) : null;
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
