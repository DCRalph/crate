import { describe, expect, test } from "bun:test";
import { EndOfStreamError } from "strtok3";

import { RangeTokenizer } from "./s3-tokenizer";

describe("RangeTokenizer", () => {
  test("reads and peeks across chunk boundaries while caching chunks", async () => {
    const source = new Uint8Array(500);
    for (let i = 0; i < source.length; i++) source[i] = i % 251;

    const calls: [number, number][] = [];
    const tokenizer = new RangeTokenizer(
      async (start, end) => {
        calls.push([start, end]);
        return source.subarray(start, end + 1);
      },
      { size: source.length, path: "track.mp3" },
      64,
    );

    // Peek at the end (like M4A moov / ID3v1 tag) without moving position.
    const tail = new Uint8Array(32);
    expect(await tokenizer.peekBuffer(tail, { position: 468, length: 32 })).toBe(32);
    expect(tail).toEqual(source.subarray(468, 500));
    expect(tokenizer.position).toBe(0);

    // Read across chunks 0, 1, 2.
    const head = new Uint8Array(150);
    expect(await tokenizer.readBuffer(head)).toBe(150);
    expect(head).toEqual(source.subarray(0, 150));
    expect(tokenizer.position).toBe(150);

    // Re-reading inside chunk 0 hits cache with no extra range call.
    const callsBefore = calls.length;
    const again = new Uint8Array(20);
    expect(await tokenizer.peekBuffer(again, { position: 10, length: 20 })).toBe(20);
    expect(again).toEqual(source.subarray(10, 30));
    expect(calls.length).toBe(callsBefore);

    // Partial read at EOF works with mayBeLess and throws EndOfStreamError otherwise.
    tokenizer.setPosition(490);
    const short = new Uint8Array(20);
    expect(await tokenizer.readBuffer(short, { mayBeLess: true })).toBe(10);
    expect(short.subarray(0, 10)).toEqual(source.subarray(490, 500));
    await expect(tokenizer.readBuffer(new Uint8Array(5))).rejects.toThrow(EndOfStreamError);
  });
});
