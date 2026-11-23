import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { scopeFor } from "~/server/access";
import { callerOf } from "~/server/auth/caller";
import { findTrackFile } from "~/server/library/queries";
import { logAccess } from "~/server/logs";
import { seal, sealingKey } from "~/server/media/sealed";
import { decideWebStream, parseWebStreamParams, transcodeArgs } from "~/server/media/transcode";
import { clientIp } from "~/server/request-origin";

/**
 * A track sealed for one device of the native app: GET /api/app/sealed/12 with
 * the device's token and, in `x-crate-key`, its public key. What comes back
 * can only be opened on that device. The app keeps it as it is for playing
 * offline, and plays streamed tracks from it too when asked to keep streams
 * encrypted. `q` and `f` ask for a conversion, as they do for a stream, and
 * the account's bitrate cap applies either way.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const caller = await callerOf(request.headers);
  if (!caller?.viaApp) return new Response("Pair the app first.", { status: 401 });
  const key = sealingKey(request.headers.get("x-crate-key") ?? "");
  if (!key) return new Response("Send the device's key.", { status: 400 });

  const scope = await scopeFor(caller.principal);
  const id = Number((await ctx.params).id);
  const file = Number.isInteger(id) ? await findTrackFile(scope, id) : undefined;
  logAccess({
    api: "app",
    endpoint: "sealed",
    userId: scope.user.id,
    username: scope.user.username,
    client: caller.client,
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent"),
    ok: !!file,
    error: file ? undefined : "Not found.",
    trackId: file?.id,
    durationMs: Date.now() - startedAt,
  });
  if (!file) return new Response("Not found.", { status: 404 });

  const decision = decideWebStream(file, parseWebStreamParams(new URL(request.url).searchParams), scope.maxBitRate);
  let source: Readable;
  if (decision.transcode) {
    const ffmpeg = spawn("ffmpeg", transcodeArgs(file.path, decision), { stdio: ["ignore", "pipe", "inherit"] });
    // The app stopped the download: stop converting the rest.
    request.signal.addEventListener("abort", () => ffmpeg.kill("SIGKILL"));
    source = ffmpeg.stdout;
  } else {
    source = createReadStream(file.path, { highWaterMark: 256 * 1024 });
  }

  const sealed = Readable.toWeb(Readable.from(seal(source, key))) as unknown as ReadableStream<Uint8Array>;
  return new Response(sealed, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "private, no-store",
      // What the audio inside is, for the app to name the file it opens it into.
      "x-crate-suffix": decision.transcode ? decision.format : file.suffix,
    },
  });
}
