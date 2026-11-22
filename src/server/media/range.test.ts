import { expect, test } from "bun:test";

import { parseRange } from "./range";

test("no header, or one we don't understand, means the whole file", () => {
  expect(parseRange(null, 1000)).toBe("all");
  expect(parseRange("bytes=0-10,20-30", 1000)).toBe("all");
  expect(parseRange("items=0-10", 1000)).toBe("all");
});

test("start-end, open-ended, and suffix ranges", () => {
  expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
  expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
  expect(parseRange("bytes=-200", 1000)).toEqual({ start: 800, end: 999 });
});

test("an end past the file is clamped; a start past it can't be satisfied", () => {
  expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
  expect(parseRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
});
