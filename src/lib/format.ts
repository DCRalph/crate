const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const steps = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
] as const;

/** "3 days ago" style. Anything under a minute is "just now". */
export function timeAgo(date: Date | null | undefined, now = Date.now()) {
  if (!date) return "Never";
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
  }
  return "just now";
}

const dateFormat = new Intl.DateTimeFormat("en-NZ", { day: "numeric", month: "short", year: "numeric" });

/** "13 Oct 2026" style dates for tables. */
export function formatDate(date: Date) {
  return dateFormat.format(date);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** "13 Oct 2026, 16:21:07" style timestamps, to the second for logs. */
export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

/** A track length: "3:42", or "1:02:09" past an hour. */
export function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** A total running time in words: "42 min", "3 hr 5 min". */
export function formatLength(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

const numberFormat = new Intl.NumberFormat("en");

/** "1 track", "1,204 tracks". */
export function count(n: number, noun: string, plural = `${noun}s`) {
  return `${numberFormat.format(n)} ${n === 1 ? noun : plural}`;
}
