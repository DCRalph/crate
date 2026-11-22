import "server-only";
import { eq, inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "~/server/db";
import { library, libraryAccess } from "~/server/db/app-schema";

/** The user fields access decisions need. Both web sessions and Subsonic logins provide them. */
export type Principal = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string | null | undefined;
  maxBitRate: number | null | undefined;
};

/**
 * What one user may reach. Every library query takes a scope, and both APIs
 * build theirs here, so access rules live in one place.
 */
export type Scope = {
  user: Principal;
  isAdmin: boolean;
  /** Libraries the user can browse and stream. */
  libraryIds: number[];
  /** The subset they can download originals from. */
  downloadLibraryIds: ReadonlySet<number>;
  /** Streaming bitrate cap in kbps, if any. */
  maxBitRate: number | null;
};

export async function scopeFor(user: Principal): Promise<Scope> {
  const isAdmin = user.role === "admin";
  const maxBitRate = user.maxBitRate && user.maxBitRate > 0 ? user.maxBitRate : null;
  if (isAdmin) {
    const ids = (await db.select({ id: library.id }).from(library)).map((row) => row.id);
    return { user, isAdmin, libraryIds: ids, downloadLibraryIds: new Set(ids), maxBitRate };
  }
  const rows = await db
    .select({ libraryId: libraryAccess.libraryId, canDownload: libraryAccess.canDownload })
    .from(libraryAccess)
    .where(eq(libraryAccess.userId, user.id));
  return {
    user,
    isAdmin,
    libraryIds: rows.map((row) => row.libraryId),
    downloadLibraryIds: new Set(rows.filter((row) => row.canDownload).map((row) => row.libraryId)),
    maxBitRate,
  };
}

/** The filter that keeps a query inside the libraries a scope can reach. */
export function inScope(column: AnyColumn, scope: Scope): SQL {
  return scope.libraryIds.length ? inArray(column, scope.libraryIds) : sql`false`;
}
