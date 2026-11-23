import { expect, test } from "bun:test";

import { decideStream, decideWebStream, parseWebStreamParams, transcodeArgs, webStreamUrl, type StreamDecision, type WebStreamPrefs } from "./transcode";

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

test("a conversion is never asked for at more than the format is encoded at", () => {
  // libopus refuses a mono file above 256.
  expect(decideStream(flac, { format: "opus", maxBitRate: 320 }, null)).toMatchObject({ format: "opus", bitRate: 256 });
  expect(decideStream(flac, { format: "mp3", maxBitRate: 500 }, null)).toMatchObject({ bitRate: 320 });
  expect(decideWebStream(flac, { maxBitRate: 320, format: "opus" }, null)).toEqual({ transcode: true, format: "opus", bitRate: 256 });
  expect(decideWebStream(flac, { convert: true, format: "opus" }, null)).toMatchObject({ bitRate: 256 });
});

const aiff = { suffix: "aiff", bitRate: 1411 };

test("web: a file the browser plays, within the limit, is sent as it is", () => {
  expect(decideWebStream(flac, {}, null)).toEqual({ transcode: false });
  expect(decideWebStream(mp3, { maxBitRate: 192, format: "opus" }, 320)).toEqual({ transcode: false });
  // The server never guesses from the extension: whether a file plays is the browser's to say.
  expect(decideWebStream(aiff, {}, null)).toEqual({ transcode: false });
});

test("web: over the limit is converted to the chosen format, mp3 unless told otherwise", () => {
  expect(decideWebStream(flac, { maxBitRate: 192 }, null)).toEqual({ transcode: true, format: "mp3", bitRate: 192 });
  expect(decideWebStream(flac, { maxBitRate: 128, format: "opus" }, null)).toEqual({ transcode: true, format: "opus", bitRate: 128 });
});

test("web: the user's cap wins over a higher or missing preference", () => {
  expect(decideWebStream(flac, { maxBitRate: 320 }, 128)).toMatchObject({ bitRate: 128 });
  expect(decideWebStream(flac, {}, 128)).toMatchObject({ bitRate: 128 });
  expect(decideWebStream(flac, { maxBitRate: 96 }, 128)).toMatchObject({ bitRate: 96 });
  expect(decideWebStream(aiff, { convert: true, maxBitRate: 320 }, 128)).toMatchObject({ bitRate: 128 });
});

test("web: a file the browser can't play is converted whatever its bitrate, at 320 with no limit and never up", () => {
  expect(decideWebStream(aiff, { convert: true }, null)).toEqual({ transcode: true, format: "mp3", bitRate: 320 });
  expect(decideWebStream(aiff, { convert: true, maxBitRate: 192, format: "aac" }, null)).toEqual({ transcode: true, format: "aac", bitRate: 192 });
  // Within the limit and under the cap, and still converted.
  expect(decideWebStream(mp3, { convert: true, maxBitRate: 320 }, 320)).toEqual({ transcode: true, format: "mp3", bitRate: 192 });
  const wma = { suffix: "wma", bitRate: 128 };
  expect(decideWebStream(wma, { convert: true }, null)).toMatchObject({ bitRate: 128 });
  expect(decideWebStream(wma, { convert: true, maxBitRate: 320 }, null)).toMatchObject({ bitRate: 128 });
});

test("web: an unknown source bitrate is only converted when there is a limit or the browser can't play it", () => {
  const wav = { suffix: "wav", bitRate: null };
  expect(decideWebStream(wav, {}, null)).toEqual({ transcode: false });
  expect(decideWebStream(wav, { maxBitRate: 192 }, null)).toMatchObject({ bitRate: 192 });
  expect(decideWebStream(wav, { convert: true }, null)).toMatchObject({ bitRate: 320 });
});

const paramsOf = (url: string) => new URL(url, "http://crate.test").searchParams;
/** What the server makes of a stream address. */
const served = (url: string, source: { bitRate: number | null }, userCap: number | null): StreamDecision =>
  decideWebStream(source, parseWebStreamParams(paramsOf(url)), userCap);

test("web: the address carries what the player decided, and the server reads it back to the same decision", () => {
  expect(webStreamUrl(7, { transcode: false })).toBe("/api/stream/7");
  expect(webStreamUrl(7, { transcode: false }, 83, "on")).toBe("/api/stream/7?at=83");
  const sent = decideWebStream(flac, { maxBitRate: 192, format: "opus" }, null);
  expect(webStreamUrl(7, sent, 83.46, "on")).toBe("/api/stream/7?q=192&f=opus&at=83.5");
  expect(parseWebStreamParams(paramsOf("/api/stream/7?q=192&f=opus&at=83.5")).offsetSeconds).toBe(83.5);
  // A new play from part way in is told apart from the same play carrying on, so it is logged.
  expect(webStreamUrl(7, sent, 83.46)).toBe("/api/stream/7?q=192&f=opus&start=83.5");
  // Carrying on from the very start (a seek back to it) still says it is the same play.
  expect(webStreamUrl(7, sent, 0, "on")).toBe("/api/stream/7?q=192&f=opus&at=0");
  expect(parseWebStreamParams(paramsOf("/api/stream/7?at=0"))).toMatchObject({ offsetSeconds: 0, carriesOn: true });
  expect(parseWebStreamParams(paramsOf("/api/stream/7?start=83.5"))).toMatchObject({ offsetSeconds: 83.5, carriesOn: false });
  expect(parseWebStreamParams(paramsOf("/api/stream/7?at=83.5"))).toMatchObject({ offsetSeconds: 83.5, carriesOn: true });

  const sources = [flac, mp3, aiff, { suffix: "wav", bitRate: null }, { suffix: "m4a", bitRate: 96 }];
  const choices: WebStreamPrefs[] = [{}, { maxBitRate: 320 }, { maxBitRate: 128, format: "opus" }, { format: "aac" }];
  for (const source of sources) {
    for (const choice of choices) {
      for (const convert of [false, true]) {
        for (const cap of [null, 320, 96]) {
          const decided = decideWebStream(source, { ...choice, convert }, cap);
          expect(served(webStreamUrl(7, decided), source, cap)).toEqual(decided);
        }
      }
    }
  }
});

test("web: the server makes a conversion the player asks for, even of a file within every limit", () => {
  expect(served("/api/stream/7?q=192&f=mp3", mp3, null)).toEqual({ transcode: true, format: "mp3", bitRate: 192 });
  expect(served("/api/stream/7?f=aac", aiff, null)).toEqual({ transcode: true, format: "aac", bitRate: 320 });
});

test("web: the user's cap wins over whatever the address asks for", () => {
  // Asked for as it is, by a player that doesn't know the cap yet.
  expect(served("/api/stream/7", flac, 128)).toEqual({ transcode: true, format: "mp3", bitRate: 128 });
  expect(served("/api/stream/7?q=320&f=opus", flac, 128)).toEqual({ transcode: true, format: "opus", bitRate: 128 });
  expect(served("/api/stream/7", mp3, 320)).toEqual({ transcode: false });
});

test("web: stream parameters that make no sense are ignored", () => {
  const nothing = { maxBitRate: null, format: undefined, convert: false, offsetSeconds: 0, carriesOn: false };
  expect(parseWebStreamParams(paramsOf("/api/stream/7"))).toEqual(nothing);
  expect(parseWebStreamParams(paramsOf("/api/stream/7?q=loud&f=wav&at=-4"))).toEqual(nothing);
  expect(parseWebStreamParams(paramsOf("/api/stream/7?q=-128&f=constructor&at=Infinity"))).toEqual(nothing);
});

test("ffmpeg takes the first audio stream, from the offset when there is one", () => {
  const args = transcodeArgs("/music/a.aiff", { format: "opus", bitRate: 192, offsetSeconds: 83.5 });
  // Before the input, so ffmpeg seeks instead of decoding and throwing away the start.
  expect(args.slice(args.indexOf("-ss"), args.indexOf("-i") + 2)).toEqual(["-ss", "83.5", "-i", "/music/a.aiff"]);
  expect(args.join(" ")).toContain("-map 0:a:0 -vn -b:a 192k -c:a libopus -f ogg pipe:1");
  expect(transcodeArgs("/music/a.aiff", { format: "mp3", bitRate: 320 })).not.toContain("-ss");
});
