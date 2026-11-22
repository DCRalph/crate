import "server-only";

import { auth } from "~/lib/auth";
import { scopeFor, type Scope } from "~/server/access";
import { principalOf } from "~/server/auth/session";
import { findTrackFile } from "~/server/library/queries";
import { logAccess } from "~/server/logs";
import { clientIp } from "~/server/request-origin";
import { fileResponse, transcodeResponse } from "./stream";
import { decideWebStream, parseWebStreamParams } from "./transcode";

/** The signed-in user's scope for a media request from the website, or null. */
export async function webScope(request: Request): Promise<Scope | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? scopeFor(principalOf(session.user)) : null;
}

/**
 * Streams or downloads a track for the website, with the same access rules
 * and logging as the Subsonic API. A stream takes the player's `q` (kbps), `f`
 * (format) and `at` (seconds in) from the address; the user's cap still wins.
 */
export async function webTrackResponse(request: Request, idParam: string, mode: "stream" | "download") {
  const startedAt = Date.now();
  const { offsetSeconds, ...prefs } = parseWebStreamParams(new URL(request.url).searchParams);
  const scope = await webScope(request);
  if (!scope) return new Response("Sign in first.", { status: 401 });

  const id = Number(idParam);
  const file = Number.isInteger(id) ? await findTrackFile(scope, id) : undefined;
  const refused = !file
    ? { status: 404, message: "Not found." }
    : mode === "download" && !scope.downloadLibraryIds.has(file.libraryId)
      ? { status: 403, message: "Downloads are turned off for this library." }
      : null;

  // A seek is a new request for the same play (a range of the file, or the
  // stream again from `at`), so only the first one is logged.
  const carriesOn = !!request.headers.get("range")?.match(/^bytes=[1-9]/) || (mode === "stream" && offsetSeconds > 0);
  if (refused || !carriesOn) {
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
  const decision = decideWebStream(file, prefs, scope.maxBitRate);
  return decision.transcode
    ? transcodeResponse(request, file.path, { ...decision, offsetSeconds })
    : fileResponse(request, file.path, file.contentType);
}
