import { z } from "zod";

/**
 * Who can listen to a playlist, or to everything in a folder: only its owner,
 * everyone on the server, or chosen people. Owners and admins always can, and
 * nobody but them can edit. Stored as a setting of its own on a playlist,
 * folder or folder rule; with none, an item follows the folder it sits in.
 */
export const audienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owner") }),
  z.object({ kind: z.literal("everyone") }),
  z.object({ kind: z.literal("people"), userIds: z.array(z.string().min(1).max(100)).max(500) }),
]);
export type Audience = z.infer<typeof audienceSchema>;

/** Where nothing in the tree sets an audience, only the owner listens. */
export const ownerOnly: Audience = { kind: "owner" };

/** Whether two settings are the same, so a change that changes nothing is noticed. Chosen people are always saved in one order. */
export const sameAudience = (a: Audience | null, b: Audience | null) =>
  a === null || b === null ? a === b : a.kind === b.kind && (a.kind !== "people" || (b.kind === "people" && a.userIds.join() === b.userIds.join()));

/** An audience as someone who can't share the item sees it: chosen people narrowed to themselves, so nobody learns who else was picked. */
export const seenBy = (audience: Audience, viewerId: string): Audience =>
  audience.kind === "people" ? { kind: "people", userIds: audience.userIds.filter((id) => id === viewerId) } : audience;

/** What can carry an audience setting of its own. */
export const audienceTargetSchema = z.object({ type: z.enum(["playlist", "folder", "rule"]), id: z.number().int() });
export type AudienceTarget = z.infer<typeof audienceTargetSchema>;

/**
 * An audience as a short line for people. `people` names who can be named;
 * `ownerName` is used when the person reading isn't the owner.
 */
export function describeAudience(audience: Audience, options: { ownerName?: string; people?: ReadonlyMap<string, string> } = {}) {
  if (audience.kind === "owner") return options.ownerName ? `Only ${options.ownerName}` : "Only me";
  if (audience.kind === "everyone") return "Everyone on this server";
  const names = audience.userIds.flatMap((id) => options.people?.get(id) ?? []).sort((a, b) => a.localeCompare(b));
  if (!audience.userIds.length) return "Chosen people: nobody yet";
  if (names.length === audience.userIds.length && names.length <= 3) return names.join(", ");
  return audience.userIds.length === 1 ? "1 person" : `${audience.userIds.length} people`;
}

/** A word for a badge or table, or null when only the owner listens. */
export function audienceBadge(audience: Audience) {
  return audience.kind === "everyone" ? "Everyone" : audience.kind === "people" ? "Shared" : null;
}

/** The same as a phrase, for a line of facts, or null when only the owner listens. */
export function sharedNote(audience: Audience) {
  return audience.kind === "everyone" ? "Shared with everyone" : audience.kind === "people" ? "Shared" : null;
}
