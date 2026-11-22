// Creates the first admin, or resets an existing user's password and makes them admin.
// There is no sign-up, so this is how the first person gets in.
//   bun create-admin <username> ["Display Name"]
// Prints a generated password once. Change it after signing in.
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { account, user } from "../src/server/db/schema";

const [rawUsername, name] = process.argv.slice(2);
const username = rawUsername?.trim().toLowerCase();
if (!username || !/^[a-z0-9_.]{2,30}$/.test(username)) {
  console.error('Usage: bun create-admin <username> ["Display Name"]\nUsernames are 2 to 30 letters, numbers, dots or underscores.');
  process.exit(1);
}

const conn = postgres(process.env.DATABASE_URL!);
const db = drizzle(conn);
const password = randomBytes(15).toString("base64url");
const hash = await hashPassword(password);

await db.transaction(async (tx) => {
  const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.username, username));
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await tx.update(user).set({ role: "admin", banned: false }).where(eq(user.id, id));
    await tx.delete(account).where(and(eq(account.userId, id), eq(account.providerId, "credential")));
  } else {
    await tx.insert(user).values({
      id,
      name: name ?? rawUsername!,
      username,
      displayUsername: rawUsername!.trim(),
      // better-auth needs an address; nothing is ever sent to it.
      email: `${username}@users.invalid`,
      emailVerified: true,
      role: "admin",
    });
  }
  await tx.insert(account).values({
    id: crypto.randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: hash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

console.log(`Admin ready.\n  Username: ${username}\n  Password: ${password}`);
await conn.end();
