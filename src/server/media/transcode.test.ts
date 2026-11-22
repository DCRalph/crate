import { expect, test } from "bun:test";

import { decideStream } from "./transcode";

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
