/**
 * Reads a single `Range: bytes=` header against a file of `size` bytes.
 * Returns the inclusive byte span to send, "all" when there is no usable
 * range, or "unsatisfiable" for one that starts past the end.
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | "all" | "unsatisfiable" {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return "all";
  const [, from, to] = match;
  if (from === "" && to === "") return "all";

  if (from === "") {
    // "-500": the last 500 bytes.
    const length = Number(to);
    if (length === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return "unsatisfiable";
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return "all";
  return { start, end };
}
