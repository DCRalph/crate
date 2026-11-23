import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { Audience, AudienceTarget } from "~/lib/audience";
import type { Scope } from "~/server/access";
import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import { folderRule, library, playlist, playlistFolder, ruleItemAudience } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { canShare, listPlaylists, loadAudiences, ruleItemAudienceOf } from "~/server/library/queries";
import type { AudiencePlace } from "./resolve-audience";

// Choosing who can listen to a playlist, a folder, or the top of what a folder
// rule makes. Working it out is resolve-audience.ts; this reads and saves the
// settings, for the web API and the Subsonic API alike.

/** Thrown when an audience can't be read or set: the item isn't there for this person, or isn't theirs to share. */
export class AudienceError extends Error {
  constructor(public reason: "not_found" | "forbidden") {
    super(reason === "not_found" ? "Not found." : "Only its owner or an admin can choose who listens.");
  }
}

const nameOf = sql<string>`coalesce(${user.username}, ${user.name})`;

/** One thing that carries a setting: where it sits, what it has now, and where the setting is saved. */
type Target = {
  name: string;
  ownerId: string;
  ownerName: string;
  own: Audience | null;
  place: AudiencePlace;
  canChange: boolean;
  /** Set when a rule made it: the setting is kept by the rule and the disk path, not on the row. */
  ruleItem: { ruleId: number; kind: "folder" | "playlist"; sourcePath: string } | null;
};

async function findTarget(scope: Scope, target: AudienceTarget): Promise<Target> {
  if (target.type === "playlist") {
    // Looked up through the listing people browse, so "not found" means the same thing everywhere.
    const [row] = await listPlaylists(scope, eq(playlist.id, target.id));
    if (!row) throw new AudienceError("not_found");
    return {
      name: row.name,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      own: row.ownAudience,
      place: { folderId: row.folderId, ruleId: row.ruleId },
      canChange: canShare(scope, row),
      ruleItem: row.ruleId !== null && row.sourcePath !== null ? { ruleId: row.ruleId, kind: "playlist", sourcePath: row.sourcePath } : null,
    };
  }
  if (target.type === "folder") {
    const [row] = await db
      .select({
        name: playlistFolder.name,
        ownerId: playlistFolder.ownerId,
        ownerName: nameOf,
        own: playlistFolder.audience,
        fromRule: ruleItemAudience.audience,
        parentId: playlistFolder.parentId,
        ruleId: playlistFolder.ruleId,
        sourcePath: playlistFolder.sourcePath,
      })
      .from(playlistFolder)
      .innerJoin(user, eq(user.id, playlistFolder.ownerId))
      .leftJoin(ruleItemAudience, ruleItemAudienceOf("folder", playlistFolder.ruleId, playlistFolder.sourcePath))
      .where(eq(playlistFolder.id, target.id));
    // Other people's folders are only ever seen through what is in them, so to anyone else this one isn't there.
    if (!row || !canShare(scope, row)) throw new AudienceError("not_found");
    return {
      name: row.name,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      own: row.own ?? row.fromRule,
      place: { folderId: row.parentId, ruleId: row.ruleId },
      canChange: true,
      ruleItem: row.ruleId !== null && row.sourcePath !== null ? { ruleId: row.ruleId, kind: "folder", sourcePath: row.sourcePath } : null,
    };
  }
  // Folder rules are set up in admin, so only admins see or change their default.
  if (!scope.isAdmin) throw new AudienceError("not_found");
  const [row] = await db
    .select({
      libraryName: library.name,
      path: folderRule.path,
      ownerId: folderRule.ownerId,
      ownerName: nameOf,
      own: folderRule.audience,
      parentFolderId: folderRule.parentFolderId,
    })
    .from(folderRule)
    .innerJoin(library, eq(library.id, folderRule.libraryId))
    .innerJoin(user, eq(user.id, folderRule.ownerId))
    .where(eq(folderRule.id, target.id));
  if (!row) throw new AudienceError("not_found");
  return {
    name: `Folder rule ${row.path ? `${row.libraryName}/${row.path}` : row.libraryName}`,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    own: row.own,
    // The rule's default sits where the rule puts what it makes, and follows that folder when it is null.
    place: { folderId: row.parentFolderId, ruleId: null },
    canChange: true,
    ruleItem: null,
  };
}

/**
 * What the "Who can listen" section shows for one item: its own setting,
 * what it follows without one (and what that means right now), and whose it
 * is. Only those who can change it may ask, since it names who else listens.
 */
export async function audienceSettings(scope: Scope, target: AudienceTarget) {
  const [item, audiences] = await Promise.all([findTarget(scope, target), loadAudiences()]);
  if (!item.canChange) throw new AudienceError("not_found");
  const inherited = audiences.inherited(item.place);
  const from = inherited.from;
  let follows: { type: "folder"; id: number; name: string } | { type: "rule"; id: number } | null = null;
  if (from && "folderId" in from) {
    const [folder] = await db.select({ name: playlistFolder.name }).from(playlistFolder).where(eq(playlistFolder.id, from.folderId));
    follows = { type: "folder", id: from.folderId, name: folder?.name ?? "its folder" };
  } else if (from) {
    follows = { type: "rule", id: from.ruleId };
  }
  return {
    own: item.own,
    inherited: { audience: inherited.audience, from: follows },
    isMine: item.ownerId === scope.user.id,
    ownerId: item.ownerId,
    ownerName: item.ownerName,
  };
}

const listenWords = { owner: "only the owner", everyone: "everyone", people: "chosen people" } as const;

/** Whether two settings are the same, so a save that changes nothing is noticed. Chosen people are kept in one order. */
const sameAudience = (a: Audience | null, b: Audience | null) =>
  a === null || b === null ? a === b : a.kind === b.kind && (a.kind !== "people" || (b.kind === "people" && a.userIds.join() === b.userIds.join()));

/**
 * Gives an item an audience of its own, or (null) makes it follow its folder
 * again, and records the change in the activity log. Chosen people are kept
 * to accounts that exist, without the owner, who always listens. Nothing is
 * written or logged when nothing changes.
 */
export async function setAudience(
  scope: Scope,
  target: AudienceTarget,
  audience: Audience | null,
  from: { headers?: Headers; ip?: string | null } = {},
) {
  const item = await findTarget(scope, target);
  if (!item.canChange) throw new AudienceError("forbidden");

  let people: { id: string; username: string }[] = [];
  if (audience?.kind === "people") {
    const asked = [...new Set(audience.userIds)].filter((id) => id !== item.ownerId);
    people = asked.length
      ? await db
          .select({ id: user.id, username: nameOf })
          .from(user)
          .where(inArray(user.id, asked))
          .orderBy(asc(user.id))
      : [];
  }
  const next: Audience | null = audience?.kind === "people" ? { kind: "people", userIds: people.map((person) => person.id) } : audience;
  if (sameAudience(item.own, next)) return;

  if (target.type === "rule") {
    await db.update(folderRule).set({ audience: next }).where(eq(folderRule.id, target.id));
  } else if (item.ruleItem) {
    const key = item.ruleItem;
    const where = and(eq(ruleItemAudience.ruleId, key.ruleId), eq(ruleItemAudience.kind, key.kind), eq(ruleItemAudience.sourcePath, key.sourcePath));
    if (next === null) await db.delete(ruleItemAudience).where(where);
    else await db.insert(ruleItemAudience).values({ ...key, audience: next }).onConflictDoUpdate({ target: [ruleItemAudience.ruleId, ruleItemAudience.kind, ruleItemAudience.sourcePath], set: { audience: next } });
  } else if (target.type === "playlist") {
    await db.update(playlist).set({ audience: next }).where(eq(playlist.id, target.id));
  } else {
    await db.update(playlistFolder).set({ audience: next }).where(eq(playlistFolder.id, target.id));
  }

  await recordActivity({
    action: "audience.changed",
    actor: { id: scope.user.id, name: scope.user.username },
    target: item.name,
    detail: {
      [target.type]: target.id,
      ...(item.ownerId === scope.user.id ? {} : { owner: item.ownerName }),
      // Plain text, so the activity log's Detail column can show it.
      listen: next === null ? "same as its folder" : listenWords[next.kind],
      ...(next?.kind === "people" ? { people: people.map((person) => person.username).join(", ") || "nobody yet" } : {}),
    },
    ...from,
  });
}

/** Everyone a person might share with: every other account, by id and name only. */
export async function sharePeople(scope: Scope) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(ne(user.id, scope.user.id))
    .orderBy(asc(sql`lower(${user.name})`));
}

/**
 * What one folder rule has made, each item with its own setting (null when it
 * follows) and who can listen right now, for the rule's page in admin.
 * Folders come parents first.
 */
export async function ruleAudiences(ruleId: number) {
  const [audiences, folders, playlists] = await Promise.all([
    loadAudiences(),
    db
      .select({
        id: playlistFolder.id,
        name: playlistFolder.name,
        parentId: playlistFolder.parentId,
        sourcePath: playlistFolder.sourcePath,
        own: ruleItemAudience.audience,
      })
      .from(playlistFolder)
      .leftJoin(ruleItemAudience, ruleItemAudienceOf("folder", playlistFolder.ruleId, playlistFolder.sourcePath))
      .where(eq(playlistFolder.ruleId, ruleId))
      .orderBy(asc(playlistFolder.sourcePath)),
    db
      .select({
        id: playlist.id,
        name: playlist.name,
        folderId: playlist.folderId,
        sourcePath: playlist.sourcePath,
        own: ruleItemAudience.audience,
      })
      .from(playlist)
      .leftJoin(ruleItemAudience, ruleItemAudienceOf("playlist", playlist.ruleId, playlist.sourcePath))
      .where(eq(playlist.ruleId, ruleId))
      .orderBy(asc(playlist.sourcePath)),
  ]);
  return {
    folders: folders.map((row) => ({ ...row, audience: audiences.folder(row.id) })),
    playlists: playlists.map((row) => ({ ...row, audience: audiences.playlist({ folderId: row.folderId, ruleId, audience: row.own }) })),
  };
}
