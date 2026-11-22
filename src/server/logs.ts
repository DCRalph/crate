import "server-only";

import { db } from "~/server/db";
import { accessLog, playEvent } from "~/server/db/app-schema";

/** Client-supplied text is cut to this before it is stored, so a request can't bloat the log. */
const clip = (text: string | null | undefined, max = 200) => (text ? text.slice(0, max) : text);

/** Adds a request to the access log. Never throws: a failed log write must not fail the request. */
export function logAccess(entry: typeof accessLog.$inferInsert) {
  void db
    .insert(accessLog)
    .values({
      ...entry,
      username: clip(entry.username, 100),
      endpoint: entry.endpoint.slice(0, 100),
      client: clip(entry.client, 100),
      userAgent: clip(entry.userAgent),
    })
    .catch((error: unknown) => console.error("[log] access log write failed:", error));
}

/** Records that a user played a track (a Subsonic scrobble, or the web player passing halfway). */
export async function recordPlay(entry: typeof playEvent.$inferInsert) {
  await db.insert(playEvent).values(entry);
}
