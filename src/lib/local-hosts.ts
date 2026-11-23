const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Host patterns (better-auth's wildcard syntax, where `*` also covers a port)
 * for the ways a home server is reached without its public address: this
 * machine, private IPv4 ranges, Tailscale's range, and `.local` names.
 *
 * `*` matches letters too, so `10.*` would also accept a name like
 * `10.example.com`. That is harmless here: a browser only sends a session
 * cookie to the host that set it, so reaching the server under another name
 * gets no one's session. The list exists to say which origins may sign in,
 * and anything else can be added with ALLOWED_HOSTS.
 */
export const localHostPatterns = [
  "localhost",
  "localhost:*",
  "127.*",
  "[::1]",
  "[::1]:*",
  "10.*",
  "192.168.*",
  ...range(16, 31).map((second) => `172.${second}.*`),
  // 100.64.0.0/10, the shared range Tailscale hands out addresses from.
  ...range(64, 127).map((second) => `100.${second}.*`),
  "*.local",
  "*.local:*",
];

/**
 * The same private ranges for `next dev`, which checks where a page was
 * opened from before it will serve its development assets. Its patterns are
 * stricter: a `*` is exactly one part of the name and there is no port. By
 * range and not by this machine's addresses, because those change under a
 * running server: a VPN that connects later (10.99.60.x, say) or a move to
 * another network would otherwise leave pages that load and never work.
 */
export const localDevOrigins = [
  "10.*.*.*",
  "192.168.*.*",
  ...range(16, 31).map((second) => `172.${second}.*.*`),
  ...range(64, 127).map((second) => `100.${second}.*.*`),
  "*.local",
];
