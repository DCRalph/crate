import "server-only";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { parseRange } from "./range";
import { transcodeArgs, transcodeFormats, type TranscodeFormat } from "./transcode";

// Node's web stream type and the DOM's differ only in their reader overloads.
const webStream = (stream: Readable) => Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

/** Sends a file, honouring `Range` so players can seek. `downloadName` makes it an attachment. */
export async function fileResponse(
  request: Request,
  filePath: string,
  contentType: string,
  options: { downloadName?: string; cacheControl?: string } = {},
): Promise<Response> {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Last-Modified": info.mtime.toUTCString(),
    "Cache-Control": options.cacheControl ?? "private, no-cache",
  });
  if (options.downloadName) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`);
  }

  const range = parseRange(request.headers.get("range"), info.size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${info.size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range === "all" ? { start: 0, end: info.size - 1 } : range;
  headers.set("Content-Length", String(info.size === 0 ? 0 : end - start + 1));
  if (range !== "all") headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
  const status = range === "all" ? 200 : 206;

  if (request.method === "HEAD" || info.size === 0) return new Response(null, { status, headers });
  return new Response(webStream(createReadStream(filePath, { start, end })), { status, headers });
}

/**
 * Streams a track through ffmpeg at `bitRate` kbps. The length isn't known in
 * advance, so there is no seeking by range; clients pass `offsetSeconds` instead.
 */
export function transcodeResponse(
  request: Request,
  filePath: string,
  options: { format: TranscodeFormat; bitRate: number; offsetSeconds?: number },
): Response {
  const ffmpeg = spawn("ffmpeg", transcodeArgs(filePath, options), { stdio: ["ignore", "pipe", "inherit"] });
  // The listener stopped or skipped: stop encoding the rest.
  request.signal.addEventListener("abort", () => ffmpeg.kill("SIGKILL"));
  ffmpeg.on("error", (error) => console.error("[transcode] ffmpeg failed to start:", error));

  return new Response(webStream(ffmpeg.stdout), {
    headers: { "Content-Type": transcodeFormats[options.format].contentType, "Cache-Control": "private, no-cache", "Accept-Ranges": "none" },
  });
}
