import { expect, test } from "bun:test";

import { playRangeFrom, playsSince } from "./most-played";

test("a range counts plays back from now, and all time counts every one", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  expect(playsSince("30d", now)).toEqual(new Date("2026-10-25T00:00:00Z"));
  expect(playsSince("90d", now)).toEqual(new Date("2026-08-26T00:00:00Z"));
  expect(playsSince("all", now)).toBeNull();
});

test("an address that names no known range gets the default", () => {
  expect(playRangeFrom("30d")).toBe("30d");
  expect(playRangeFrom(null)).toBe("90d");
  expect(playRangeFrom("7d")).toBe("90d");
  expect(playRangeFrom("toString")).toBe("90d");
});
