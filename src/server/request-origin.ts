import "server-only";

/**
 * The caller's address. Next fills `x-forwarded-for` from the socket when
 * nothing in front has set it, and a reverse proxy appends the real client to
 * the end, so the last entry is the one a client can't forge (given one proxy).
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  if (!last) return null;
  // IPv4-mapped IPv6, as Node reports local connections.
  return last.startsWith("::ffff:") ? last.slice(7) : last;
}
