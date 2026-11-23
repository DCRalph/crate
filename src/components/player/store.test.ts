import { beforeEach, describe, expect, test } from "bun:test";

import type { WebTrack } from "~/server/api/routers/library";
import { usePlayer } from "./store";

const track = (id: number) => ({ id, title: `Track ${id}` }) as WebTrack;
const tracks = [1, 2, 3, 4, 5].map(track);
const ids = (list: WebTrack[] | null) => list?.map((item) => item.id);
const state = () => usePlayer.getState();
const current = () => state().queue[state().index]?.id;

beforeEach(() => usePlayer.setState({ queue: [], index: 0, lineup: null, repeat: "off", playing: false }));

describe("shuffle", () => {
  test("keeps the current track playing and holds every track once", () => {
    state().play(tracks, 2);
    state().toggleShuffle();
    expect(current()).toBe(3);
    expect(state().index).toBe(0);
    expect(ids(state().queue)?.toSorted()).toEqual([1, 2, 3, 4, 5]);
  });

  test("off puts the queue back as it was lined up, on the same track", () => {
    state().play(tracks, 2);
    state().toggleShuffle();
    state().next();
    const playing = current();
    state().toggleShuffle();
    expect(ids(state().queue)).toEqual([1, 2, 3, 4, 5]);
    expect(current()).toBe(playing);
    expect(state().lineup).toBeNull();
  });

  test("a chosen track still plays first", () => {
    state().toggleShuffle();
    state().play(tracks, 3);
    expect(current()).toBe(4);
    expect(ids(state().lineup)).toEqual([1, 2, 3, 4, 5]);
  });

  test("tracks added or removed while shuffled are still there, or still gone, afterwards", () => {
    state().play(tracks, 0);
    state().toggleShuffle();
    state().enqueue([track(6)]);
    state().playNext([track(7)]);
    state().remove(state().queue.findIndex((item) => item.id === 4));
    expect(state().queue[1]?.id).toBe(7);
    state().toggleShuffle();
    expect(ids(state().queue)).toEqual([1, 7, 2, 3, 5, 6]);
  });
});

describe("queue", () => {
  test("play next goes straight after the current track", () => {
    state().play(tracks, 1);
    state().playNext([track(9)]);
    expect(ids(state().queue)).toEqual([1, 2, 9, 3, 4, 5]);
    expect(current()).toBe(2);
  });

  test("next stops at the end, or goes round again when repeating", () => {
    state().play(tracks, 4);
    state().next();
    expect(state().playing).toBe(false);
    expect(current()).toBe(5);

    state().cycleRepeat();
    state().next();
    expect(state().playing).toBe(true);
    expect(current()).toBe(1);
  });

  test("repeat goes off, all, one, off", () => {
    const seen = [1, 2, 3].map(() => (state().cycleRepeat(), state().repeat));
    expect(seen).toEqual(["all", "one", "off"]);
  });
});
