import type { Readable } from "node:stream";
import type { IAudioMetadata, IOptions } from "music-metadata";

import type { LibrarySourceType } from "~/lib/library-source";
import type { PlaylistFile } from "~/server/playlists/playlist-file";

export type ScannedFile = {
  /** Stored unique path in DB (`track.path`). For local: absolute path. For remote: `${library.path}/${relPath}`. */
  path: string;
  /** Path inside the library, with forward slashes. */
  relPath: string;
  size: number;
  mtimeMs: number;
  /** Stored cover path in DB (`album.coverPath`), or null. */
  coverPath: string | null;
};

export interface LibrarySource {
  readonly type: LibrarySourceType;
  readonly canonicalPath: string;

  /** Verifies the source is reachable (mounting SMB/NFS if needed). Throws an informative Error on failure. */
  check(): Promise<{ detail?: string }>;

  /** Lists every audio file in the library, along with the cover image in its folder if there is one. */
  listAudioFiles(onFound: () => void): Promise<ScannedFile[]>;

  /** Parses audio metadata tags for a file at `relPath`. */
  parseMetadata(relPath: string, info: { size: number; mimeType?: string }, options?: IOptions): Promise<IAudioMetadata>;

  /** True when a folder (relative to library root, `""` for root) exists in this library. */
  hasFolder(relDir: string): Promise<boolean>;

  /** Lists and reads `.m3u` and `.m3u8` files under `relDir` (`""` for root). */
  listPlaylistFiles(relDir: string): Promise<PlaylistFile[]>;

  /** True when a file at `relPath` exists in this library. */
  fileExists(relPath: string): Promise<boolean>;

  /** Stats a cover file stored at `coverPath` (returns mtimeMs or null if missing). */
  statCover(coverPath: string): Promise<{ mtimeMs: number } | null>;

  /** Returns either a local file path or raw bytes for sharp to decode a stored `coverPath`. */
  readCoverInput(coverPath: string): Promise<string | Uint8Array | null>;

  /** Extracts embedded cover art bytes from an audio file at `relPath`. */
  readEmbeddedCover(relPath: string, size: number): Promise<Uint8Array | null>;

  /** Serves a direct (non-transcoded) HTTP response with Range, HEAD, and Content-Disposition support. */
  fileResponse(
    request: Request,
    file: { relPath: string; size?: number; mtimeMs?: number; contentType: string },
    options?: { downloadName?: string; cacheControl?: string },
  ): Promise<Response>;

  /** Returns an ffmpeg input (local path or presigned URL) plus optional pre-input flags (such as `-reconnect`). */
  ffmpegInput(relPath: string): Promise<{ input: string; preInputArgs?: string[] }>;

  /** Opens a Node Readable stream for the whole file (used for sealed app downloads). */
  openReadStream(relPath: string, signal?: AbortSignal): Promise<Readable>;
}
