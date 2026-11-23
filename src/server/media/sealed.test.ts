import { createDecipheriv, generateKeyPairSync, randomBytes } from "node:crypto";
import { expect, mock, test } from "bun:test";

import { chunkBinding, chunkNonce, readSealedHeader, sealedHeaderLength, sealedTagLength } from "~/lib/sealed-format";

void mock.module("server-only", () => ({}));
void mock.module("~/env", () => ({ env: { BETTER_AUTH_SECRET: "a secret that is only for this test" } }));
const { seal, sealingKey, serverKey } = await import("./sealed");

/** Opens sealed bytes the way the app does, or throws where the app would refuse. */
function open(sealed: Buffer, key: Uint8Array) {
  const header = readSealedHeader(sealed);
  if (!header) throw new Error("not sealed audio");
  const step = header.chunkSize + sealedTagLength;
  const out: Buffer[] = [];
  for (let at = sealedHeaderLength, index = 0; at < sealed.length || index === 0; at += step, index++) {
    const chunk = sealed.subarray(at, at + step);
    const decipher = createDecipheriv("aes-256-gcm", key, chunkNonce(header.noncePrefix, index));
    decipher.setAAD(chunkBinding(index, at + step >= sealed.length));
    decipher.setAuthTag(chunk.subarray(chunk.length - sealedTagLength));
    out.push(decipher.update(chunk.subarray(0, chunk.length - sealedTagLength)), decipher.final());
  }
  return Buffer.concat(out);
}

async function sealed(plain: Buffer, key: Uint8Array, chunkSize: number, pieces = 7) {
  async function* source() {
    for (let at = 0; at < plain.length; at += pieces) yield plain.subarray(at, at + pieces);
  }
  const out: Uint8Array[] = [];
  for await (const part of seal(source(), key, chunkSize)) out.push(part);
  return Buffer.concat(out);
}

const key = randomBytes(32);

test("what is sealed opens to what went in, whatever its length against the chunk size", async () => {
  for (const length of [0, 1, 63, 64, 65, 128, 1000]) {
    const plain = randomBytes(length);
    expect(open(await sealed(plain, key, 64), key).equals(plain)).toBe(true);
  }
});

test("a file cut off at a chunk, or with chunks swapped, doesn't open", async () => {
  const whole = await sealed(randomBytes(300), key, 64);
  const step = 64 + sealedTagLength;
  const cut = whole.subarray(0, sealedHeaderLength + step * 2);
  expect(() => open(cut, key)).toThrow();
  const swapped = Buffer.concat([whole.subarray(0, sealedHeaderLength), whole.subarray(sealedHeaderLength + step, sealedHeaderLength + step * 2), whole.subarray(sealedHeaderLength, sealedHeaderLength + step), whole.subarray(sealedHeaderLength + step * 2)]);
  expect(() => open(swapped, key)).toThrow();
});

test("a device's key gives the same sealing key every time, another device's a different one, and junk none", () => {
  const device = () => generateKeyPairSync("x25519").publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  const one = device();
  expect(sealingKey(one)?.equals(sealingKey(one)!)).toBe(true);
  expect(sealingKey(one)?.equals(sealingKey(device())!)).toBe(false);
  expect(sealingKey("not a key")).toBeNull();
  expect(Buffer.from(serverKey, "base64")).toHaveLength(32);
});
