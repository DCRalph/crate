import { describe, expect, test } from "bun:test";

import type { Audience } from "~/lib/audience";
import { audienceResolver, canListen, type AudienceFolder } from "./resolve-audience";

const everyone: Audience = { kind: "everyone" };
const owner: Audience = { kind: "owner" };
const alice: Audience = { kind: "people", userIds: ["alice"] };

// Mixes (1) > 2025 (2) > Summer (3), and Albums (4) on its own.
const folders: AudienceFolder[] = [
  { id: 1, parentId: null, ruleId: null, audience: null },
  { id: 2, parentId: 1, ruleId: null, audience: null },
  { id: 3, parentId: 2, ruleId: null, audience: null },
  { id: 4, parentId: null, ruleId: null, audience: null },
];
const withSetting = (id: number, audience: Audience) => folders.map((folder) => (folder.id === id ? { ...folder, audience } : folder));

describe("audienceResolver", () => {
  test("with nothing set anywhere, only the owner listens", () => {
    const resolve = audienceResolver({ folders, rules: [] });
    expect(resolve.playlist({ folderId: null, ruleId: null, audience: null })).toEqual(owner);
    expect(resolve.playlist({ folderId: 3, ruleId: null, audience: null })).toEqual(owner);
    expect(resolve.inherited({ folderId: null, ruleId: null })).toEqual({ audience: owner, from: null });
  });

  test("a folder's setting reaches everything below it", () => {
    const resolve = audienceResolver({ folders: withSetting(1, alice), rules: [] });
    expect(resolve.folder(3)).toEqual(alice);
    expect(resolve.playlist({ folderId: 3, ruleId: null, audience: null })).toEqual(alice);
    // Each item names the folder it sits in, which says who that currently means.
    expect(resolve.inherited({ folderId: 3, ruleId: null })).toEqual({ audience: alice, from: { folderId: 3 } });
    // Nothing leaks sideways.
    expect(resolve.folder(4)).toEqual(owner);
  });

  test("the nearest setting up the tree wins", () => {
    const tree = withSetting(1, everyone).map((folder) => (folder.id === 2 ? { ...folder, audience: alice } : folder));
    const resolve = audienceResolver({ folders: tree, rules: [] });
    expect(resolve.folder(1)).toEqual(everyone);
    expect(resolve.folder(3)).toEqual(alice);
    expect(resolve.playlist({ folderId: 1, ruleId: null, audience: null })).toEqual(everyone);
  });

  test("an item's own setting wins over its folder's, including only the owner", () => {
    const resolve = audienceResolver({ folders: withSetting(1, everyone), rules: [] });
    expect(resolve.playlist({ folderId: 3, ruleId: null, audience: owner })).toEqual(owner);
    expect(resolve.playlist({ folderId: 3, ruleId: null, audience: alice })).toEqual(alice);
  });

  describe("folder rules", () => {
    // Rule 7 puts what it makes in Mixes (1): Disk (10) > Inner (11).
    const made: AudienceFolder[] = [
      ...folders,
      { id: 10, parentId: 1, ruleId: 7, audience: null },
      { id: 11, parentId: 10, ruleId: 7, audience: null },
    ];

    test("the rule's default is where the top of what it makes starts", () => {
      const resolve = audienceResolver({ folders: made, rules: [{ id: 7, audience: everyone }] });
      expect(resolve.folder(10)).toEqual(everyone);
      expect(resolve.folder(11)).toEqual(everyone);
      // A playlist at the top of what the rule makes, beside its folders.
      expect(resolve.inherited({ folderId: 1, ruleId: 7 })).toEqual({ audience: everyone, from: { ruleId: 7 } });
      // Deeper down, things follow their own folder, which follows the rule.
      expect(resolve.inherited({ folderId: 11, ruleId: 7 })).toEqual({ audience: everyone, from: { folderId: 11 } });
      // The owner's folder the rule sits in is not changed by it.
      expect(resolve.folder(1)).toEqual(owner);
    });

    test("a rule with no default follows the folder it is put in", () => {
      const resolve = audienceResolver({ folders: made.map((folder) => (folder.id === 1 ? { ...folder, audience: alice } : folder)), rules: [{ id: 7, audience: null }] });
      expect(resolve.folder(11)).toEqual(alice);
      expect(resolve.inherited({ folderId: 1, ruleId: 7 })).toEqual({ audience: alice, from: { folderId: 1 } });
    });

    test("something a rule made can set its own, which reaches below it", () => {
      const tree = made.map((folder) => (folder.id === 11 ? { ...folder, audience: owner } : folder));
      const resolve = audienceResolver({ folders: tree, rules: [{ id: 7, audience: everyone }] });
      expect(resolve.folder(10)).toEqual(everyone);
      expect(resolve.playlist({ folderId: 11, ruleId: 7, audience: null })).toEqual(owner);
      expect(resolve.playlist({ folderId: 11, ruleId: 7, audience: alice })).toEqual(alice);
    });

    test("at the top level, the rule's default is all there is", () => {
      const resolve = audienceResolver({ folders: [], rules: [{ id: 8, audience: alice }] });
      expect(resolve.playlist({ folderId: null, ruleId: 8, audience: null })).toEqual(alice);
      expect(audienceResolver({ folders: [], rules: [{ id: 8, audience: null }] }).playlist({ folderId: null, ruleId: 8, audience: null })).toEqual(owner);
    });
  });

  test("a folder that is missing, or a loop, means only the owner", () => {
    const loop: AudienceFolder[] = [
      { id: 1, parentId: 2, ruleId: null, audience: null },
      { id: 2, parentId: 1, ruleId: null, audience: null },
    ];
    const resolve = audienceResolver({ folders: loop, rules: [] });
    expect(resolve.folder(1)).toEqual(owner);
    expect(resolve.playlist({ folderId: 99, ruleId: null, audience: null })).toEqual(owner);
  });
});

describe("canListen", () => {
  const bob = { id: "bob", isAdmin: false };
  test("owners and admins always can", () => {
    expect(canListen(owner, "bob", bob)).toBe(true);
    expect(canListen(owner, "alice", { id: "carol", isAdmin: true })).toBe(true);
  });
  test("others only when the audience takes them in", () => {
    expect(canListen(owner, "alice", bob)).toBe(false);
    expect(canListen(everyone, "alice", bob)).toBe(true);
    expect(canListen(alice, "carol", bob)).toBe(false);
    expect(canListen({ kind: "people", userIds: ["alice", "bob"] }, "carol", bob)).toBe(true);
  });
});
