import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import * as appSchema from "./app-schema";
import * as authSchema from "./schema";

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as unknown as { conn?: postgres.Sql };
const conn = globalForDb.conn ?? postgres(env.DATABASE_URL);
if (process.env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema: { ...authSchema, ...appSchema } });
export type Db = typeof db;
