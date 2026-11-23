import "server-only";
import { createCipheriv, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, randomBytes } from "node:crypto";

import { env } from "~/env";
import { chunkBinding, chunkNonce, sealedChunkSize, sealedHeader, sealedInfo } from "~/lib/sealed-format";

// Sealed audio is how the native app gets music it will keep: encrypted for
// one device, so it is unreadable on the way there and on the phone's disk
// alike. The key is never sent. The server and the device each have an X25519
// key pair, swap public keys, and arrive at the same secret on their own.

// X25519 keys travel as their 32 raw bytes; Node wants them wrapped as DER.
const pkcs8 = Buffer.from("302e020100300506032b656e04220420", "hex");
const spki = Buffer.from("302a300506032b656e032100", "hex");

// The server's key pair comes from its secret, so it is the same after a restart and there is nothing to store.
const privateKey = createPrivateKey({
  key: Buffer.concat([pkcs8, Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", "crate:app-key", 32))]),
  format: "der",
  type: "pkcs8",
});

/** The server's public key, base64. The app keeps it from the day it pairs. */
export const serverKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32).toString("base64");

/** The key audio is sealed with for the device whose public key this is, or null when it isn't a key. */
export function sealingKey(deviceKey: string) {
  const raw = Buffer.from(deviceKey, "base64");
  if (raw.length !== 32) return null;
  try {
    const shared = diffieHellman({ privateKey, publicKey: createPublicKey({ key: Buffer.concat([spki, raw]), format: "der", type: "spki" }) });
    return Buffer.from(hkdfSync("sha256", shared, "", sealedInfo, 32));
  } catch {
    return null;
  }
}

/**
 * Seals audio as it is read, a chunk at a time (see `sealed-format`). It
 * holds one chunk back, because the last chunk has to say that it is the last.
 */
export async function* seal(source: AsyncIterable<Uint8Array>, key: Uint8Array, chunkSize = sealedChunkSize) {
  const noncePrefix = randomBytes(8);
  yield sealedHeader(noncePrefix, chunkSize);

  let index = 0;
  const sealChunk = (plain: Uint8Array, final: boolean) => {
    const cipher = createCipheriv("aes-256-gcm", key, chunkNonce(noncePrefix, index));
    cipher.setAAD(chunkBinding(index++, final));
    return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  };

  let held = Buffer.alloc(0);
  for await (const piece of source) {
    held = Buffer.concat([held, piece]);
    // Strictly more than a chunk: a chunk that exactly fills the buffer may still be the last.
    while (held.length > chunkSize) {
      yield sealChunk(held.subarray(0, chunkSize), false);
      held = held.subarray(chunkSize);
    }
  }
  yield sealChunk(held, true);
}
