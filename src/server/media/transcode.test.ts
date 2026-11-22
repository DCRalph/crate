import { expect, test } from "bun:test";

import { decideStream, decideWebStream, parseWebStreamParams, webStreamUrl } from "./transcode";

const flac = { suffix: "flac", bitRate: 900 };
const mp3 = { suffix: "mp3", bitRate: 192 };

test("nothing asked, nothing capped: the file as it is", () => {
  expect(decideStream(flac, {}, null)).toEqual({ transcode: false });
  expect(decideStream(mp3, { maxBitRate: 0 }, null)).toEqual({ transcode: false });
});

test("over the client's limit is transcoded down to it", () => {
  expect(decideStream(flac, { maxBitRate: 320 }, null)).toEqual({ transcode: true, format: "mp3", bitRate: 320 });
  expect(decideStream(mp3, { maxBitRate: 320 }, null)).toEqual({ transcode: false });
});

test("the lower of the client's limit and the user's cap wins", () => {
  expect(decideStream(flac, { maxBitRate: 320 }, 128)).toMatchObject({ bitRate: 128 });
  expect(decideStream(flac, { maxBitRate: 96 }, 128)).toMatchObject({ bitRate: 96 });
});

test("format=raw can't get around a user's cap", () => {
  expect(decideStream(flac, { format: "raw" }, null)).toEqual({ transcode: false });
  expect(decideStream(flac, { format: "raw" }, 128)).toEqual({ transcode: true, format: "mp3", bitRate: 128 });
});

test("another format is transcoded, never to a higher bitrate than the source", () => {
  expect(decideStream(mp3, { format: "opus" }, null)).toEqual({ transcode: true, format: "opus", bitRate: 192 });
  expect(decideStream({ suffix: "mp3", bitRate: 96 }, { format: "opus", maxBitRate: 320 }, null)).toMatchObject({ bitRate: 96 });
  expect(decideStream(mp3, { format: "mp3" }, null)).toEqual({ transcode: false });
});

test("an unknown source bitrate under a cap is transcoded to be safe", () => {
  expect(decideStream({ suffix: "wav", bitRate: null }, {}, 128)).toEqual({ transcode: true, format: "mp3", bitRate: 128 });
});

const ape = { suffix: "ape", bitRate: 900 };

test("web: a format the browser plays, within the limit, is sent as it is", () => {
  expect(decideWebStream(flac, {}, null)).toEqual({ transcode: false });
  expect(decideWebStream(mp3, { maxBitRate: 192, format: "opus" }, 320)).toEqual({ transcode: false });
});

test("web: over the limit is converted to the chosen format, mp3 unless told otherwise", () => {
  expect(decideWebStream(flac, { maxBitRate: 192 }, null)).toEqual({ transcode: true, format: "mp3", bitRate: 192 });
  expect(decideWebStream(flac, { maxBitRate: 128, format: "opus" }, null)).toEqual({ transcode: true, format: "opus", bitRate: 128 });
});

test("web: the user's cap wins over a higher or missing preference", () => {
  expect(decideWebStream(flac, { maxBitRate: 320 }, 128)).toMatchObject({ bitRate: 128 });
  expect(decideWebStream(flac, {}, 128)).toMatchObject({ bitRate: 128 });
  expect(decideWebStream(flac, { maxBitRate: 96 }, 128)).toMatchObject({ bitRate: 96 });
});

test("web: a format the browser can't play is converted, at 320 with no limit and never up", () => {
  expect(decideWebStream(ape, {}, null)).toEqual({ transcode: true, format: "mp3", bitRate: 320 });
  expect(decideWebStream(ape, { maxBitRate: 192, format: "aac" }, null)).toEqual({ transcode: true, format: "aac", bitRate: 192 });
  expect(decideWebStream({ suffix: "wma", bitRate: 128 }, {}, null)).toMatchObject({ bitRate: 128 });
  expect(decideWebStream({ suffix: "wma", bitRate: 128 }, { maxBitRate: 320 }, null)).toMatchObject({ bitRate: 128 });
});

test("web: an unknown source bitrate is only converted when there is a limit", () => {
  expect(decideWebStream({ suffix: "wav", bitRate: null }, {}, null)).toEqual({ transcode: false });
  expect(decideWebStream({ suffix: "wav", bitRate: null }, { maxBitRate: 192 }, null)).toMatchObject({ bitRate: 192 });
});

const paramsOf = (url: string) => new URL(url, "http://crate.test").searchParams;

test("web: the server reads a stream address back to the same decision", () => {
  expect(webStreamUrl(7, { transcode: false })).toBe("/api/stream/7");
  expect(webStreamUrl(7, { transcode: false }, 83)).toBe("/api/stream/7?at=83");

  const sent = decideWebStream(flac, { maxBitRate: 192, format: "opus" }, null);
  const url = webStreamUrl(7, sent, 83.46);
  expect(url).toBe("/api/stream/7?q=192&f=opus&at=83.5");
  const { offsetSeconds, ...prefs } = parseWebStreamParams(paramsOf(url));
  expect(offsetSeconds).toBe(83.5);
  expect(decideWebStream(flac, prefs, null)).toEqual(sent);
});

test("web: stream parameters that make no sense are ignored", () => {
  const nothing = { maxBitRate: null, format: undefined, offsetSeconds: 0 };
  expect(parseWebStreamParams(paramsOf("/api/stream/7"))).toEqual(nothing);
  expect(parseWebStreamParams(paramsOf("/api/stream/7?q=loud&f=wav&at=-4"))).toEqual(nothing);
  expect(parseWebStreamParams(paramsOf("/api/stream/7?q=-128&f=constructor&at=Infinity"))).toEqual(nothing);
});
