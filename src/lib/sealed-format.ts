/**
 * How sealed audio is laid out. The server seals a track for one device of
 * the native app; the app keeps the bytes as they arrive and opens them when
 * the track is played. Both sides build and read it from here.
 *
 *   header   "CRT1" (4 bytes) | chunk size (u32) | nonce prefix (8 bytes)
 *   chunks   each one: up to `chunk size` bytes of AES-256-GCM ciphertext, then its 16-byte tag
 *
 * A chunk's nonce is the prefix followed by its number, so no nonce repeats
 * inside a file, and the prefix is random, so none repeats between files.
 * Each chunk is also bound to its number and to whether it is the last, which
 * is what makes a file with chunks removed, reordered or cut off fail to open.
 * Numbers are big-endian.
 */
export const sealedMagic = [0x43, 0x52, 0x54, 0x31] as const;
export const sealedHeaderLength = 16;
export const sealedTagLength = 16;
/** Plaintext bytes in every chunk but the last. */
export const sealedChunkSize = 512 * 1024;
/** What the key is derived for. Changing the layout means changing this. */
export const sealedInfo = "crate:sealed:v1";

const u32 = (value: number) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];

export function sealedHeader(noncePrefix: Uint8Array, chunkSize = sealedChunkSize) {
  return Uint8Array.from([...sealedMagic, ...u32(chunkSize), ...noncePrefix.subarray(0, 8)]);
}

/** Reads a header back. Null when the bytes aren't the start of sealed audio. */
export function readSealedHeader(bytes: Uint8Array) {
  if (bytes.length < sealedHeaderLength || sealedMagic.some((byte, i) => bytes[i] !== byte)) return null;
  const chunkSize = ((bytes[4]! << 24) | (bytes[5]! << 16) | (bytes[6]! << 8) | bytes[7]!) >>> 0;
  return chunkSize > 0 ? { chunkSize, noncePrefix: bytes.slice(8, 16) } : null;
}

/** The 12-byte nonce of chunk `index`. */
export const chunkNonce = (noncePrefix: Uint8Array, index: number) => Uint8Array.from([...noncePrefix, ...u32(index)]);

/** What chunk `index` is bound to besides its key and nonce: its number, and whether the file ends with it. */
export const chunkBinding = (index: number, final: boolean) => Uint8Array.from([...u32(index), final ? 1 : 0]);
