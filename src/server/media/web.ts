import "server-only";

import { auth } from "~/lib/auth";
import { scopeFor, type Scope } from "~/server/access";
import { principalOf } from "~/server/auth/session";
import { findTrackFile } from "~/server/library/queries";
import { logAccess } from "~/server/logs";
import { clientIp } from "~/server/request-origin";
import { fileResponse, transcodeResponse } from "./stream";
import { decideStream } from "./transcode";

/** The signed-in user's scope for a media request from the website, or null. */
export async function webScope(request: Request): Promise<Scope | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? scopeFor(principalOf(session.user)) : null;
}

/** Formats browsers play natively. Anything else is transcoded for the web player. */
const browserPlayable = new Set(["mp3", "flac", "m4a", "aac", "ogg", "oga", "opus", "wav"]);

/**
 * Streams or downloads a track for the website, with the same access rules
 * and logging as the Subsonic API.
 */
export async function webTrackResponse(request: Request, idParam: string, mode: "stream" | "download") {
  const startedAt = Date.now();
  const scope = await webScope(request);
  if (!scope) return new Response("Sign in first.", { status: 401 });

  const id = Number(idParam);
  const file = Number.isInteger(id) ? await findTrackFile(scope, id) : undefined;
  const refused = !file
    ? { status: 404, message: "Not found." }
    : mode === "download" && !scope.downloadLibraryIds.has(file.libraryId)
      ? { status: 403, message: "Downloads are turned off for this library." }
      : null;

  // A seek is a new ranged request for the same play, so only the first one is logged.
  if (refused || !request.headers.get("range")?.match(/^bytes=[1-9]/)) {
    logAccess({
      api: "web",
      endpoint: mode,
      userId: scope.user.id,
      username: scope.user.username,
      client: "Web",
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
      ok: !refused,
      error: refused?.message,
      trackId: file?.id,
      durationMs: Date.now() - startedAt,
    });
  }
  if (refused || !file) return new Response(refused?.message, { status: refused?.status });

  if (mode === "download") {
    return fileResponse(request, file.path, file.contentType, { downloadName: `${file.artistName} - ${file.title}.${file.suffix}` });
  }
  const decision = decideStream(file, browserPlayable.has(file.suffix) ? {} : { format: "mp3", maxBitRate: 320 }, scope.maxBitRate);
  return decision.transcode ? transcodeResponse(request, file.path, decision) : fileResponse(request, file.path, file.contentType);
}
