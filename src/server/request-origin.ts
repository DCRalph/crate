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

/**
 * Whether the caller reached the server over https. A proxy that terminates
 * TLS says so in `x-forwarded-proto` (Next fills it in from the socket when
 * nothing else has). When the public address is https, a request for that
 * host, or one a browser says came from that origin, counts as https too, so
 * a proxy that passes on neither header can't downgrade the public site.
 */
export function overHttps(headers: Headers, publicUrl: string): boolean {
  if (headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  const site = new URL(publicUrl);
  if (site.protocol !== "https:") return false;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  return host === site.host || headers.get("origin") === site.origin;
}

/**
 * The origin the caller reached the server through, e.g. http://192.168.1.20:3000,
 * or the public address when the request doesn't say. Used to show people the
 * address that works from where they are.
 */
export function requestOrigin(headers: Headers, publicUrl: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return publicUrl;
  return `${overHttps(headers, publicUrl) ? "https" : "http"}://${host}`;
}
