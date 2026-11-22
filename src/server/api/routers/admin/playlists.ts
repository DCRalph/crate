import { asc, count, eq, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { playlist, playlistFolder, playlistTrack } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { buildListQuery, listResult, type ListColumnMap } from "~/server/list/build-list-query";
import { listInputSchema } from "~/server/list/list-input";
import { folderPaths } from "~/server/playlists/folders";
import { adminProcedure, router } from "../../trpc";

const tracks = db
  .select({ playlistId: playlistTrack.playlistId, total: count().as("tracks") })
  .from(playlistTrack)
  .groupBy(playlistTrack.playlistId)
  .as("tracks");
const ownerName = sql<string>`coalesce(${user.username}, ${user.name})`;
const trackCount = sql<number>`coalesce(${tracks.total}, 0)::int`;

const columns = {
  name: { column: playlist.name, type: "text", searchable: true, sortable: true },
  owner: { column: ownerName, type: "text", searchable: true, sortable: true, filterable: true },
  trackCount: { column: trackCount, type: "number", sortable: true },
  isPublic: { column: playlist.isPublic, type: "boolean", filterable: true },
  fromDisk: { column: playlist.readOnly, type: "boolean", filterable: true },
  updatedAt: { column: playlist.updatedAt, type: "date", sortable: true, filterable: true },
} satisfies ListColumnMap;

export const playlistsRouter = router({
  /** Every playlist on the server, whoever owns it, with where it sits in its owner's folders. */
  list: adminProcedure.input(listInputSchema).query(async ({ input }) => {
    const query = buildListQuery(columns, input, { defaultSort: [asc(sql`lower(${playlist.name})`), asc(playlist.id)] });
    const [rows, [total], folders] = await Promise.all([
      db
        .select({
          id: playlist.id,
          name: playlist.name,
          owner: ownerName,
          isPublic: playlist.isPublic,
          fromDisk: playlist.readOnly,
          folderId: playlist.folderId,
          updatedAt: playlist.updatedAt,
          trackCount,
        })
        .from(playlist)
        .innerJoin(user, eq(user.id, playlist.ownerId))
        .leftJoin(tracks, eq(tracks.playlistId, playlist.id))
        .where(query.where)
        .orderBy(...query.orderBy)
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ total: count() })
        .from(playlist)
        .innerJoin(user, eq(user.id, playlist.ownerId))
        .leftJoin(tracks, eq(tracks.playlistId, playlist.id))
        .where(query.where),
      db.select({ id: playlistFolder.id, name: playlistFolder.name, parentId: playlistFolder.parentId }).from(playlistFolder),
    ]);
    const paths = folderPaths(folders);
    return listResult(
      rows.map((row) => ({ ...row, folder: row.folderId === null ? null : (paths.get(row.folderId) ?? null) })),
      total?.total ?? 0,
      input,
    );
  }),
});
