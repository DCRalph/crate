import { desc, eq, sql } from "drizzle-orm";

import { db } from "~/server/db";
import { accessLog, activity, playEvent, track } from "~/server/db/app-schema";
import { buildListQuery, listResult, type ListColumnMap } from "~/server/list/build-list-query";
import { listInputSchema } from "~/server/list/list-input";
import { adminProcedure, router } from "../../trpc";

// Each log is read a page at a time, newest first unless the table sorts by
// time the other way. The keys of each column map are the table's column ids;
// search and filters only read the log's own table, so the counts need no joins.

/** Whether a row is a sign-in or a change someone made. Every sign-in action starts `auth.`. */
const activityKind = sql<"sign-ins" | "changes">`case when ${activity.action} like 'auth.%' then 'sign-ins' else 'changes' end`;

const activityColumns = {
  at: { column: activity.at, type: "date", sortable: true, filterable: true },
  kind: { column: activityKind, type: "enum", filterable: true },
  actorName: { column: activity.actorName, type: "text", searchable: true, filterable: true },
  action: { column: activity.action, type: "enum", filterable: true },
  target: { column: activity.target, type: "text", searchable: true },
  ip: { column: activity.ip, type: "text", searchable: true },
} satisfies ListColumnMap;

const requestColumns = {
  at: { column: accessLog.at, type: "date", sortable: true, filterable: true },
  username: { column: accessLog.username, type: "text", searchable: true, filterable: true },
  api: { column: accessLog.api, type: "enum", filterable: true },
  endpoint: { column: accessLog.endpoint, type: "text", searchable: true, filterable: true },
  result: { column: sql`case when ${accessLog.ok} then 'ok' else 'failed' end`, type: "enum", filterable: true },
  client: { column: accessLog.client, type: "text", searchable: true, filterable: true },
  ip: { column: accessLog.ip, type: "text", searchable: true, filterable: true },
} satisfies ListColumnMap;

const playColumns = {
  at: { column: playEvent.at, type: "date", sortable: true, filterable: true },
  username: { column: playEvent.username, type: "text", searchable: true, filterable: true },
  title: { column: playEvent.title, type: "text", searchable: true, filterable: true },
  artistName: { column: playEvent.artistName, type: "text", searchable: true, filterable: true },
  client: { column: playEvent.client, type: "text", searchable: true, filterable: true },
} satisfies ListColumnMap;

export const logsRouter = router({
  /** Sign-ins and changes. */
  activity: adminProcedure.input(listInputSchema).query(async ({ input }) => {
    const query = buildListQuery(activityColumns, input, { defaultSort: [desc(activity.id)] });
    const [rows, total] = await Promise.all([
      db
        .select({
          id: activity.id,
          at: activity.at,
          kind: activityKind,
          actorName: activity.actorName,
          action: activity.action,
          target: activity.target,
          detail: activity.detail,
          ip: activity.ip,
        })
        .from(activity)
        .where(query.where)
        .orderBy(...query.orderBy)
        .limit(query.limit)
        .offset(query.offset),
      db.$count(activity, query.where),
    ]);
    return listResult(rows, total, input);
  }),

  /** Every Subsonic request and media request. */
  requests: adminProcedure.input(listInputSchema).query(async ({ input }) => {
    const query = buildListQuery(requestColumns, input, { defaultSort: [desc(accessLog.id)] });
    const [rows, total] = await Promise.all([
      db
        .select({
          id: accessLog.id,
          at: accessLog.at,
          username: accessLog.username,
          api: accessLog.api,
          endpoint: accessLog.endpoint,
          client: accessLog.client,
          ip: accessLog.ip,
          ok: accessLog.ok,
          error: accessLog.error,
          durationMs: accessLog.durationMs,
          trackTitle: track.title,
        })
        .from(accessLog)
        .leftJoin(track, eq(track.id, accessLog.trackId))
        .where(query.where)
        .orderBy(...query.orderBy)
        .limit(query.limit)
        .offset(query.offset),
      db.$count(accessLog, query.where),
    ]);
    return listResult(rows, total, input);
  }),

  /** Every finished play. */
  plays: adminProcedure.input(listInputSchema).query(async ({ input }) => {
    const query = buildListQuery(playColumns, input, { defaultSort: [desc(playEvent.id)] });
    const [rows, total] = await Promise.all([
      db
        .select({
          id: playEvent.id,
          at: playEvent.at,
          username: playEvent.username,
          title: playEvent.title,
          artistName: playEvent.artistName,
          client: playEvent.client,
          ip: playEvent.ip,
        })
        .from(playEvent)
        .where(query.where)
        .orderBy(...query.orderBy)
        .limit(query.limit)
        .offset(query.offset),
      db.$count(playEvent, query.where),
    ]);
    return listResult(rows, total, input);
  }),
});
