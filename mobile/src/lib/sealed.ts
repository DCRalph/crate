import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, getRandomBytes } from "expo-crypto";
import type { File } from "expo-file-system";

import { chunkBinding, chunkNonce, readSealedHeader, sealedHeaderLength, sealedInfo, sealedTagLength } from "~/lib/sealed-format";
import { fromBase64, toBase64 } from "./format";

// Audio the app keeps comes from the server sealed for this one device (the
// layout is in the shared `sealed-format`). The key is never sent either way:
// the device makes a key pair when it pairs, gives the server the public half
// with each request, and both arrive at the same secret on their own.

/**
 * Agrees a key with a server from the server's public key. Returns the
 * device's public key, to send with requests for sealed audio, and the key
 * that opens what comes back. The private key isn't needed again and isn't kept.
 */
export function agreeKey(serverKey: string) {
  const secret = getRandomBytes(32);
  const shared = x25519.getSharedSecret(secret, fromBase64(serverKey));
  return {
    deviceKey: toBase64(x25519.getPublicKey(secret)),
    sealKey: toBase64(hkdf(sha256, shared, undefined, new TextEncoder().encode(sealedInfo), 32)),
  };
}

/** Whether a file starts the way sealed audio does. A refused or broken download doesn't. */
export function isSealed(file: File) {
  if (!file.exists || file.size < sealedHeaderLength) return false;
  const handle = file.open();
  try {
    return readSealedHeader(handle.readBytes(sealedHeaderLength)) !== null;
  } finally {
    handle.close();
  }
}

/**
 * Opens a sealed file into `out`, a chunk at a time, so a long track is never
 * all in memory. Throws if the file isn't sealed audio, was sealed for another
 * device, or has been cut short or altered.
 */
export async function openSealed(sealed: File, out: File, sealKey: string) {
  const key = await AESEncryptionKey.import(fromBase64(sealKey));
  const from = sealed.open();
  if (out.exists) out.delete();
  out.create();
  const to = out.open();
  try {
    const header = readSealedHeader(from.readBytes(sealedHeaderLength));
    if (!header) throw new Error("This isn't sealed audio.");
    const total = from.size ?? 0;
    const step = header.chunkSize + sealedTagLength;
    for (let at = sealedHeaderLength, index = 0; at < total || index === 0; at += step, index++) {
      const chunk = from.readBytes(Math.min(step, total - at));
      const data = AESSealedData.fromParts(chunkNonce(header.noncePrefix, index), chunk, sealedTagLength);
      to.writeBytes(await aesDecryptAsync(data, key, { additionalData: chunkBinding(index, at + step >= total) }));
    }
  } finally {
    from.close();
    to.close();
  }
}
