import "server-only";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { appPassword } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";

// App passwords are credentials for Subsonic clients. Each is generated here,
// shown once, and tied to one device so it can be revoked on its own. Subsonic's
// token login (md5 of password + salt) can only be checked by a server that
// knows the password, so the secret is stored encrypted rather than only hashed.

const key = Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", "crate:app-password", 32));
const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // No l, o, 0, 1: these get typed on phones.

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function encrypt(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

function decrypt(stored: string) {
  const raw = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

const sameText = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Makes an app password for a user. The returned `secret` is the only time it is readable. */
export async function createAppPassword(userId: string, name: string) {
  const secret = Array.from({ length: 24 }, () => alphabet[randomInt(alphabet.length)]).join("");
  const [row] = await db
    .insert(appPassword)
    .values({ userId, name, secretHash: sha256(secret), secretEnc: encrypt(secret) })
    .returning({ id: appPassword.id });
  return { id: row!.id, secret };
}

const principalColumns = {
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  role: user.role,
  maxBitRate: user.maxBitRate,
  banned: user.banned,
};

export type SubsonicCredentials =
  | { kind: "apiKey"; apiKey: string }
  | { kind: "token"; username: string; token: string; salt: string }
  | { kind: "password"; username: string; password: string };

/**
 * Finds the user and app password a Subsonic login belongs to, or null.
 * Usernames match case-insensitively; disabled users never match.
 */
export async function verifySubsonicLogin(credentials: SubsonicCredentials) {
  const select = () =>
    db.select({ user: principalColumns, password: appPassword }).from(appPassword).innerJoin(user, eq(user.id, appPassword.userId));

  let match;
  if (credentials.kind === "token") {
    const candidates = await select().where(eq(user.username, credentials.username.toLowerCase()));
    const token = credentials.token.toLowerCase();
    match = candidates.find((row) =>
      sameText(createHash("md5").update(decrypt(row.password.secretEnc) + credentials.salt).digest("hex"), token),
    );
  } else {
    const secret = credentials.kind === "apiKey" ? credentials.apiKey : credentials.password;
    [match] = await select().where(eq(appPassword.secretHash, sha256(secret)));
    if (credentials.kind === "password" && match?.user.username !== credentials.username.toLowerCase()) match = undefined;
  }

  if (!match || match.user.banned || !match.user.username) return null;
  return {
    user: { ...match.user, username: match.user.username },
    appPassword: { id: match.password.id, name: match.password.name, lastUsedAt: match.password.lastUsedAt },
  };
}

/** Notes that an app password was just used. At most once a minute per password, to keep writes down. */
export async function touchAppPassword(
  password: { id: number; lastUsedAt: Date | null },
  seen: { ip: string | null; client: string | null },
) {
  if (password.lastUsedAt && Date.now() - password.lastUsedAt.getTime() < 60_000) return;
  await db
    .update(appPassword)
    .set({ lastUsedAt: new Date(), lastUsedIp: seen.ip, lastUsedClient: seen.client })
    .where(eq(appPassword.id, password.id));
}
