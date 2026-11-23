import { decideWebStream, webStreamUrl } from "~/server/media/transcode";
import type { Track } from "./api";
import { authHeaders, type Server } from "./servers";
import type { Quality } from "./settings";

/** What iOS plays as it is. Anything else is asked for as MP3. */
const playable = new Set(["mp3", "m4a", "aac", "mp4", "flac", "wav", "aiff", "aif", "caf"]);

/**
 * How a track is asked for: as the file, or converted when the phone can't
 * play its kind or the file is above `quality` (kbps; null is no limit). The
 * account's cap is the server's to apply.
 */
const decide = (track: Pick<Track, "suffix" | "bitRate">, quality: Quality) => decideWebStream(track, { convert: !playable.has(track.suffix.toLowerCase()), format: "mp3", maxBitRate: quality }, null);

/** The kind of file a track arrives as, for naming the file it is opened into. */
export function arrivesAs(track: Pick<Track, "suffix" | "bitRate">, quality: Quality) {
  const sent = decide(track, quality);
  return sent.transcode ? sent.format : track.suffix.toLowerCase();
}

/** Where a track streams from, as it is. */
export const streamUrl = (server: Server, track: Track, quality: Quality) => server.url + webStreamUrl(track.id, decide(track, quality));

/** Where a track comes from sealed for this phone, and what has to be sent to get it. */
export function sealedRequest(server: Server, track: Track, quality: Quality) {
  const query = webStreamUrl(track.id, decide(track, quality)).split("?")[1];
  return {
    url: `${server.url}/api/app/sealed/${track.id}${query ? `?${query}` : ""}`,
    headers: { ...authHeaders(server), "x-crate-key": server.deviceKey },
  };
}

/** A cover, for an image. `version` is anything that changes when the picture does. */
export const coverSource = (server: Server, type: "album" | "playlist" | "artist", id: number, size: number, version?: string) => ({
  uri: `${server.url}/api/cover/${type}/${id}?size=${size}${version ? `&v=${encodeURIComponent(version)}` : ""}`,
  headers: authHeaders(server),
});
