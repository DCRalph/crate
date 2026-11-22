import "server-only";

import type { ActivityAction } from "~/lib/activity-actions";
import { db } from "~/server/db";
import { activity } from "~/server/db/app-schema";
import { clientIp } from "~/server/request-origin";

/** Adds a row to the activity log. Pass the request's headers so it records where the action came from. */
export async function recordActivity(entry: {
  action: ActivityAction;
  actor: { id: string | null; name: string | null };
  target?: string;
  detail?: Record<string, unknown>;
  headers?: Headers;
  ip?: string | null;
}) {
  await db.insert(activity).values({
    action: entry.action,
    actorId: entry.actor.id,
    // Failed sign-ins put whatever was typed here, so it is cut to a sane length.
    actorName: entry.actor.name?.slice(0, 100),
    target: entry.target,
    detail: entry.detail,
    ip: entry.ip ?? (entry.headers ? clientIp(entry.headers) : null),
    userAgent: entry.headers?.get("user-agent")?.slice(0, 200) ?? null,
  });
}
