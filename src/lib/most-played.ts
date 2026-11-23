// Most played: a person's top tracks over a span of their own plays. Shared by
// the query, the tRPC input and the page's range switch.

/** The spans Most played can cover. */
export const playRanges = ["30d", "90d", "all"] as const;
export type PlayRange = (typeof playRanges)[number];

export const defaultPlayRange: PlayRange = "90d";

const days: Record<PlayRange, number | null> = { "30d": 30, "90d": 90, all: null };

/** The earliest play a range counts, or null when it counts them all. */
export function playsSince(range: PlayRange, now = new Date()) {
  const span = days[range];
  return span === null ? null : new Date(now.getTime() - span * 86_400_000);
}

/** The range an address names (?range=30d), or the default when it names none. */
export const playRangeFrom = (value: string | null): PlayRange => playRanges.find((range) => range === value) ?? defaultPlayRange;
