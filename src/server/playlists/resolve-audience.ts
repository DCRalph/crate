import { ownerOnly, type Audience } from "~/lib/audience";

/** A folder as the resolver sees it. `audience` is its own setting, null when it follows its parent. */
export type AudienceFolder = { id: number; parentId: number | null; ruleId: number | null; audience: Audience | null };

/**
 * Something sitting in the tree: a playlist, or a folder seen from inside its
 * parent. `folderId` is where it sits, `ruleId` the folder rule that made it.
 */
export type AudiencePlace = { folderId: number | null; ruleId: number | null };

/**
 * What an item gets when it sets nothing itself, and from where: the folder it
 * sits in, the default of the rule that made it, or (null) the top level,
 * where only the owner listens.
 */
export type Inherited = { audience: Audience; from: { folderId: number } | { ruleId: number } | null };

/**
 * Works out who can listen to anything in the playlist tree, from every
 * folder's own setting and each folder rule's default. Built once per request
 * from two queries (see `loadAudiences`), then asked about as many items as
 * needed.
 *
 * An item's own setting wins. Without one it follows the folder it sits in,
 * which is that folder's own setting or, in turn, its parent's: the nearest
 * setting up the tree wins. At the top level only the owner listens. The top
 * of what a folder rule makes (whatever sits directly in the folder the rule
 * puts it in) takes the rule's default before looking further up.
 */
export function audienceResolver(tree: { folders: AudienceFolder[]; rules: { id: number; audience: Audience | null }[] }) {
  const folders = new Map(tree.folders.map((folder) => [folder.id, folder]));
  const rules = new Map(tree.rules.map((rule) => [rule.id, rule.audience]));
  const known = new Map<number, Audience>();
  const visiting = new Set<number>();

  const inherited = (place: AudiencePlace): Inherited => {
    const parent = place.folderId === null ? undefined : folders.get(place.folderId);
    // Directly in a folder its rule didn't make: the top of what that rule makes.
    if (place.ruleId !== null && parent?.ruleId !== place.ruleId) {
      const ruleDefault = rules.get(place.ruleId);
      if (ruleDefault) return { audience: ruleDefault, from: { ruleId: place.ruleId } };
    }
    if (!parent) return { audience: ownerOnly, from: null };
    return { audience: ofFolder(parent.id), from: { folderId: parent.id } };
  };

  const ofFolder = (id: number): Audience => {
    const cached = known.get(id);
    if (cached) return cached;
    const folder = folders.get(id);
    // A loop can't be saved, but one would only ever mean the owner alone.
    if (!folder || visiting.has(id)) return ownerOnly;
    visiting.add(id);
    const audience = folder.audience ?? inherited({ folderId: folder.parentId, ruleId: folder.ruleId }).audience;
    visiting.delete(id);
    known.set(id, audience);
    return audience;
  };

  return {
    /** What an item sitting at `place` gets with no setting of its own. */
    inherited,
    /** Who can listen to a folder and, unless they set their own, everything in it. */
    folder: ofFolder,
    /** Who can listen to a playlist: its own setting, or what it inherits. */
    playlist: (item: AudiencePlace & { audience: Audience | null }) => item.audience ?? inherited(item).audience,
  };
}

export type AudienceResolver = ReturnType<typeof audienceResolver>;

/** Whether someone may listen to an item with this audience. Owners and admins always may. */
export function canListen(audience: Audience, ownerId: string, viewer: { id: string; isAdmin: boolean }) {
  if (viewer.isAdmin || viewer.id === ownerId) return true;
  return audience.kind === "everyone" || (audience.kind === "people" && audience.userIds.includes(viewer.id));
}
