import "server-only";
import { lt } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { accessLog } from "~/server/db/app-schema";
import { startScan } from "~/server/library/scanner";

/** The access log grows with every request, so it is kept for this long. Plays and activity are kept for good. */
const ACCESS_LOG_DAYS = 90;
const DAY_MS = 24 * 60 * 60_000;

// Timers survive dev hot reloads on globalThis, so they aren't started twice.
const state = globalThis as unknown as { crateSchedules?: boolean };

export function startSchedules() {
  if (state.crateSchedules) return;
  state.crateSchedules = true;

  if (env.SCAN_INTERVAL_MINUTES) {
    setInterval(() => startScan(), env.SCAN_INTERVAL_MINUTES * 60_000).unref();
  }

  const prune = () =>
    db
      .delete(accessLog)
      .where(lt(accessLog.at, new Date(Date.now() - ACCESS_LOG_DAYS * DAY_MS)))
      .catch((error: unknown) => console.error("[log] pruning failed:", error));
  void prune();
  setInterval(prune, DAY_MS).unref();
}
