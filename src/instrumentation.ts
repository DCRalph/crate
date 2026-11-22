/**
 * Runs once when the server starts: the scheduled rescan and log pruning.
 * Imports are dynamic because this file is also loaded for the edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSchedules } = await import("~/server/schedules");
  startSchedules();
}
