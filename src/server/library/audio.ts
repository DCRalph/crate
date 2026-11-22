/** Audio files the scanner picks up, by extension, with the content type they are served as. */
export const audioTypes: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  aiff: "audio/aiff",
  aif: "audio/aiff",
  wma: "audio/x-ms-wma",
  ape: "audio/x-monkeys-audio",
  wv: "audio/x-wavpack",
  dsf: "audio/x-dsf",
};

/** Lowercase extension without the dot, "" when there is none. */
export function suffixOf(file: string) {
  const dot = file.lastIndexOf(".");
  return dot < 0 ? "" : file.slice(dot + 1).toLowerCase();
}

/** A cover image sitting beside the tracks. */
export const coverFilePattern = /^(cover|folder|front|album|albumart)\.(jpe?g|png|webp)$/i;
