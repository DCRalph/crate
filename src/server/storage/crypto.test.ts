import { randomBytes } from "node:crypto";
import { expect, mock, test } from "bun:test";

void mock.module("server-only", () => ({}));
void mock.module("~/env", () => ({ env: { BETTER_AUTH_SECRET: "a secret that is only for this test" } }));
const { decryptSecret, encryptSecret } = await import("./crypto");

test("encryptSecret and decryptSecret round-trip with unique IVs and fail on tamper", () => {
  const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  const a = encryptSecret(secret);
  const b = encryptSecret(secret);
  expect(a).not.toBe(b);
  expect(decryptSecret(a)).toBe(secret);
  expect(decryptSecret(b)).toBe(secret);

  const raw = Buffer.from(a, "base64");
  raw[raw.length - 1] ^= 0xff;
  expect(() => decryptSecret(raw.toString("base64"))).toThrow();

  const otherKey = randomBytes(32);
  expect(() => decryptSecret(a, otherKey)).toThrow();
});
