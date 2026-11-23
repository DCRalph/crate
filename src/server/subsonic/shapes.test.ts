import { expect, test } from "bun:test";

import type { Scope } from "~/server/access";
import { mostPlayed, parseId, toMostPlayedPlaylist } from "./shapes";
import { SubsonicError } from "./respond";

const scope: Scope = {
  user: { id: "u1", name: "Sam", username: "sam", email: "sam@example.com", role: "user", maxBitRate: null },
  isAdmin: false,
  libraryIds: [1],
  downloadLibraryIds: new Set(),
  maxBitRate: null,
};

test("Most played's id is never a real playlist's", () => {
  expect(parseId("pl-12")).toEqual({ type: "playlist", id: 12 });
  expect(() => parseId(mostPlayed.id)).toThrow(SubsonicError);
});

test("Most played is read only, covered by its top track's album, and changed at the latest play", () => {
  const playlist = toMostPlayedPlaylist(scope, [
    { albumId: 7, duration: 200, lastPlayedAt: new Date("2026-11-01T10:00:00Z") },
    { albumId: 3, duration: 100, lastPlayedAt: new Date("2026-11-20T10:00:00Z") },
  ]);
  expect(playlist).toMatchObject({ id: mostPlayed.id, owner: "sam", songCount: 2, duration: 300, coverArt: "al-7", readonly: true });
  expect(playlist.changed).toBe("2026-11-20T10:00:00.000Z");
});

test("with no plays, Most played is listed empty and without a cover", () => {
  const playlist = toMostPlayedPlaylist(scope, []);
  expect(playlist).toMatchObject({ songCount: 0, duration: 0, coverArt: undefined });
  expect(Number.isNaN(Date.parse(playlist.changed))).toBe(false);
});
