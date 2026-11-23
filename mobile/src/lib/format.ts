/** "3:07", or "1:02:45" from an hour up. */
export function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds));
  const s = String(whole % 60).padStart(2, "0");
  const minutes = Math.floor(whole / 60);
  return minutes < 60 ? `${minutes}:${s}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${s}`;
}

/** "3 hr 38 min" for an album or playlist. */
export function formatLength(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

/** "1 track", "12 tracks". */
export const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** "412 MB", "1.3 GB". */
export function formatBytes(bytes: number) {
  const mb = bytes / 1_000_000;
  return mb < 1000 ? `${Math.round(mb)} MB` : `${(mb / 1000).toFixed(1)} GB`;
}

/** A row's number as printed: two digits at least, "07". */
export const rowNumber = (index: number) => String(index + 1).padStart(2, "0");

const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Bytes to base64 and back. The phone's JavaScript has no Buffer and no reliable btoa. */
export function toBase64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    out += table[a >> 2]! + table[((a & 3) << 4) | ((b ?? 0) >> 4)]! + (b === undefined ? "=" : table[((b & 15) << 2) | ((c ?? 0) >> 6)]!) + (c === undefined ? "=" : table[c & 63]!);
  }
  return out;
}
export function fromBase64(text: string) {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  for (let i = 0, o = 0; i < clean.length; i += 4) {
    const [a, b, c, d] = [0, 1, 2, 3].map((n) => table.indexOf(clean[i + n] ?? "A")) as [number, number, number, number];
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (triple >> 16) & 255;
    if (o < out.length) out[o++] = (triple >> 8) & 255;
    if (o < out.length) out[o++] = triple & 255;
  }
  return out;
}
