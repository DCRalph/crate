import { expect, test } from "bun:test";

import { downsample, loudnessMeter, toPeaks } from "./peaks";

/** `seconds` of a square wave at `level`, as 16-bit little-endian mono at 4 kHz. */
function tone(level: number, seconds: number) {
  const samples = new Int16Array(4000 * seconds).map((_, i) => (i % 2 ? level : -level));
  return new Uint8Array(samples.buffer);
}

test("a meter reads the same loudness however the audio is cut into chunks", () => {
  const audio = tone(8000, 1);
  const whole = loudnessMeter();
  whole.add(audio);
  const pieces = loudnessMeter();
  // An odd size, so every chunk ends halfway through a sample.
  for (let at = 0; at < audio.length; at += 333) pieces.add(audio.subarray(at, at + 333));
  expect(pieces.windows).toEqual(whole.windows);
  expect(whole.windows).toHaveLength(50);
  expect(whole.windows[0]).toBeCloseTo(8000);
});

test("peaks follow the track: quiet, then loud, with the loudest part at the top", () => {
  const meter = loudnessMeter();
  meter.add(tone(1000, 1));
  meter.add(tone(16000, 1));
  const peaks = toPeaks(meter.windows, 10);
  expect(peaks[9]).toBe(255);
  expect(peaks[0]).toBeGreaterThan(0);
  expect(peaks[0]).toBeLessThan(peaks[9]! / 2);
  expect([...peaks.slice(0, 5)].every((peak) => peak === peaks[0])).toBe(true);
});

test("silence and nothing at all are flat, not an error", () => {
  const meter = loudnessMeter();
  meter.add(tone(0, 1));
  expect(Math.max(...toPeaks(meter.windows, 8))).toBe(0);
  expect(toPeaks([], 8)).toEqual(new Uint8Array(8));
});

test("a mix hours long is measured like any other track", () => {
  // Six hours of 20 ms windows, more than Math.max(...windows) can take.
  const peaks = toPeaks(new Array<number>(6 * 60 * 60 * 50).fill(500), 8);
  expect([...peaks]).toEqual(new Array<number>(8).fill(255));
});

test("a small waveform keeps the loudest slice of each bucket", () => {
  const peaks = new Uint8Array(1000);
  peaks[500] = 255;
  peaks[501] = 40;
  const thumb = downsample(peaks, 64);
  expect(thumb).toHaveLength(64);
  expect(thumb[32]).toBe(255);
  expect(thumb.filter((value) => value > 0)).toEqual([255]);
});

test("a waveform shorter than its buckets is stretched across them", () => {
  expect(downsample([10, 20], 4)).toEqual([10, 10, 20, 20]);
});
