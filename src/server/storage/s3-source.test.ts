import { spawn, spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { formatS3Error, S3LibrarySource } from "./s3-source";

type StoredObject = { body: Uint8Array<ArrayBuffer>; contentType: string; lastModified: Date };

const xmlEscape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal in-process S3 HTTP server supporting ListObjectsV2 (with pagination), HeadObject, and GetObject (with Range). */
function startMockS3(buckets: Map<string, Map<string, StoredObject>>, options: { pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 2;
  const rangeCalls: string[] = [];

  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const parts = url.pathname.replace(/^\/+/, "").split("/");
      const bucketName = decodeURIComponent(parts[0] ?? "");
      const key = parts.slice(1).map(decodeURIComponent).join("/");
      const bucket = buckets.get(bucketName);

      if (!bucket) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchBucket</Code><Message>The specified bucket does not exist</Message></Error>`,
          { status: 404, headers: { "Content-Type": "application/xml" } },
        );
      }

      // ListObjectsV2: GET /<bucket>?list-type=2
      if (!key && request.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const maxKeys = Math.min(Number(url.searchParams.get("max-keys") ?? 1000), pageSize);
        const token = url.searchParams.get("continuation-token");
        const startIndex = token ? Number(token) : 0;

        const matching = [...bucket.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .sort(([a], [b]) => a.localeCompare(b));
        const slice = matching.slice(startIndex, startIndex + maxKeys);
        const isTruncated = startIndex + maxKeys < matching.length;
        const nextToken = isTruncated ? String(startIndex + maxKeys) : "";

        const contents = slice
          .map(
            ([k, obj]) =>
              `<Contents><Key>${xmlEscape(k)}</Key><LastModified>${obj.lastModified.toISOString()}</LastModified><Size>${obj.body.byteLength}</Size></Contents>`,
          )
          .join("");

        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
          `<Name>${xmlEscape(bucketName)}</Name>` +
          `<Prefix>${xmlEscape(prefix)}</Prefix>` +
          `<KeyCount>${slice.length}</KeyCount>` +
          `<MaxKeys>${maxKeys}</MaxKeys>` +
          `<IsTruncated>${isTruncated}</IsTruncated>` +
          (nextToken ? `<NextContinuationToken>${nextToken}</NextContinuationToken>` : "") +
          contents +
          `</ListBucketResult>`;
        return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml" } });
      }

      const obj = bucket.get(key);
      if (!obj) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>`,
          { status: 404, headers: { "Content-Type": "application/xml" } },
        );
      }

      const baseHeaders = {
        "Content-Type": obj.contentType,
        "Last-Modified": obj.lastModified.toUTCString(),
        "Accept-Ranges": "bytes",
      };

      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers: { ...baseHeaders, "Content-Length": String(obj.body.byteLength) } });
      }

      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        rangeCalls.push(`${key}:${rangeHeader}`);
        const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), obj.body.byteLength - 1) : obj.body.byteLength - 1;
          if (start > end || start >= obj.body.byteLength) {
            return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${obj.body.byteLength}` } });
          }
          const slice = obj.body.subarray(start, end + 1);
          return new Response(slice, {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Length": String(slice.byteLength),
              "Content-Range": `bytes ${start}-${end}/${obj.body.byteLength}`,
            },
          });
        }
      }

      return new Response(obj.body, {
        status: 200,
        headers: { ...baseHeaders, "Content-Length": String(obj.body.byteLength) },
      });
    },
  });

  return {
    endpoint: `http://127.0.0.1:${server.port}`,
    rangeCalls,
    stop: () => server.stop(true),
  };
}

/** Synthesizes a short tagged MP3 with ffmpeg so metadata parsing, streaming, and ffmpeg transcoding are tested for real. */
function makeSampleMp3(): Uint8Array<ArrayBuffer> | null {
  const res = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-metadata",
      "title=Signal Tone",
      "-metadata",
      "artist=Test Synth",
      "-metadata",
      "album=Lab Tapes",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-f",
      "mp3",
      "pipe:1",
    ],
    { maxBuffer: 5 * 1024 * 1024 },
  );
  if (res.status !== 0 || !res.stdout?.length) return null;
  return new Uint8Array(res.stdout);
}

describe("S3LibrarySource (against local mock S3)", () => {
  const sampleMp3 = makeSampleMp3();
  const coverBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const modified = new Date("2026-10-01T12:00:00Z");

  let mock: ReturnType<typeof startMockS3>;
  let source: S3LibrarySource;

  beforeAll(() => {
    const objects = new Map<string, StoredObject>();
    const audioBytes = sampleMp3 ?? new Uint8Array(1024).fill(0x41);
    objects.set("music/Artist/Album/01 Signal Tone.mp3", { body: audioBytes, contentType: "audio/mpeg", lastModified: modified });
    objects.set("music/Artist/Album/cover.jpg", { body: coverBytes, contentType: "image/jpeg", lastModified: modified });
    objects.set("music/Artist/Album/order.m3u8", {
      body: new TextEncoder().encode("#EXTM3U\n01 Signal Tone.mp3\n"),
      contentType: "audio/x-mpegurl",
      lastModified: modified,
    });
    // Hidden file and non-audio file should be ignored by scanner.
    objects.set("music/Artist/.hidden.mp3", { body: audioBytes, contentType: "audio/mpeg", lastModified: modified });
    objects.set("music/Artist/notes.txt", { body: new TextEncoder().encode("hi"), contentType: "text/plain", lastModified: modified });
    // Outside prefix: should never be returned.
    objects.set("other/outside.mp3", { body: audioBytes, contentType: "audio/mpeg", lastModified: modified });

    mock = startMockS3(new Map([["crate-test", objects]]), { pageSize: 2 });
    source = new S3LibrarySource({
      bucket: "crate-test",
      region: "us-east-1",
      endpoint: mock.endpoint,
      prefix: "music",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      forcePathStyle: true,
    });
  });

  afterAll(() => {
    mock.stop();
  });

  test("check() verifies reachability and reports missing buckets clearly", async () => {
    const ok = await source.check();
    expect(ok.detail).toContain("crate-test");

    const missing = new S3LibrarySource({
      bucket: "does-not-exist",
      region: "us-east-1",
      endpoint: mock.endpoint,
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      forcePathStyle: true,
    });
    await expect(missing.check()).rejects.toThrow(/not found/i);
  });

  test("listAudioFiles() paginates, respects prefix, skips hidden files, and pairs folder covers", async () => {
    let foundCount = 0;
    const files = await source.listAudioFiles(() => foundCount++);
    expect(foundCount).toBe(1);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      relPath: "Artist/Album/01 Signal Tone.mp3",
      path: `${source.canonicalPath}/Artist/Album/01 Signal Tone.mp3`,
      coverPath: `${source.canonicalPath}/Artist/Album/cover.jpg`,
      mtimeMs: modified.getTime(),
    });
  });

  test("parseMetadata() parses real audio tags via HTTP byte-range requests", async () => {
    if (!sampleMp3) return;
    mock.rangeCalls.length = 0;
    const meta = await source.parseMetadata(
      "Artist/Album/01 Signal Tone.mp3",
      { size: sampleMp3.byteLength, mimeType: "audio/mpeg" },
      { skipCovers: true },
    );
    expect(meta.common.title).toBe("Signal Tone");
    expect(meta.common.artist).toBe("Test Synth");
    expect(meta.common.album).toBe("Lab Tapes");
    expect(Math.round(meta.format.duration ?? 0)).toBe(1);
    expect(mock.rangeCalls.length).toBeGreaterThan(0);
  });

  test("cover stat/read, hasFolder, fileExists, and playlist files work over S3", async () => {
    const coverPath = `${source.canonicalPath}/Artist/Album/cover.jpg`;
    expect(await source.statCover(coverPath)).toEqual({ mtimeMs: modified.getTime() });
    expect(await source.readCoverInput(coverPath)).toEqual(coverBytes);

    expect(await source.hasFolder("")).toBe(true);
    expect(await source.hasFolder("Artist/Album")).toBe(true);
    expect(await source.hasFolder("NoSuchFolder")).toBe(false);

    expect(await source.fileExists("Artist/Album/01 Signal Tone.mp3")).toBe(true);
    expect(await source.fileExists("Artist/Album/missing.mp3")).toBe(false);

    const playlists = await source.listPlaylistFiles("Artist");
    expect(playlists).toEqual([{ relPath: "Artist/Album/order.m3u8", entries: ["Artist/Album/01 Signal Tone.mp3"] }]);
  });

  test("fileResponse() handles full GET, HEAD, byte Range 206, 416, download headers, and 404", async () => {
    const expected = sampleMp3 ?? new Uint8Array(1024).fill(0x41);
    const file = { relPath: "Artist/Album/01 Signal Tone.mp3", size: expected.byteLength, mtimeMs: modified.getTime(), contentType: "audio/mpeg" };

    // Full GET with download disposition
    const full = await source.fileResponse(new Request("http://crate.test/api/download/1"), file, { downloadName: "Signal Tone.mp3" });
    expect(full.status).toBe(200);
    expect(full.headers.get("content-disposition")).toContain("Signal%20Tone.mp3");
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(expected);

    // HEAD
    const head = await source.fileResponse(new Request("http://crate.test/api/stream/1", { method: "HEAD" }), file);
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(expected.byteLength));
    expect(head.headers.get("accept-ranges")).toBe("bytes");

    // Range 206
    const partial = await source.fileResponse(
      new Request("http://crate.test/api/stream/1", { headers: { range: "bytes=10-49" } }),
      file,
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-range")).toBe(`bytes 10-49/${expected.byteLength}`);
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(expected.subarray(10, 50));

    // Unsatisfiable range 416
    const badRange = await source.fileResponse(
      new Request("http://crate.test/api/stream/1", { headers: { range: `bytes=${expected.byteLength + 100}-` } }),
      file,
    );
    expect(badRange.status).toBe(416);

    // Missing object 404
    const missing = await source.fileResponse(new Request("http://crate.test/api/stream/2"), {
      relPath: "nope.mp3",
      contentType: "audio/mpeg",
    });
    expect(missing.status).toBe(404);
  });

  test("ffmpegInput() produces a presigned URL that ffmpeg decodes directly", async () => {
    if (!sampleMp3) return;
    const { input, preInputArgs } = await source.ffmpegInput("Artist/Album/01 Signal Tone.mp3");
    expect(input.startsWith(mock.endpoint)).toBe(true);
    expect(preInputArgs).toContain("-reconnect");

    const { status, bytes } = await new Promise<{ status: number | null; bytes: number }>((resolve, reject) => {
      const proc = spawn("ffmpeg", ["-v", "error", ...(preInputArgs ?? []), "-i", input, "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"]);
      let total = 0;
      proc.stdout.on("data", (chunk: Buffer) => {
        total += chunk.byteLength;
      });
      proc.on("error", reject);
      proc.on("close", (code) => resolve({ status: code, bytes: total }));
    });
    expect(status).toBe(0);
    expect(bytes).toBeGreaterThan(8000);
  });

  test("openReadStream() streams the full object for sealed downloads", async () => {
    const expected = sampleMp3 ?? new Uint8Array(1024).fill(0x41);
    const stream = await source.openReadStream("Artist/Album/01 Signal Tone.mp3");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    expect(new Uint8Array(Buffer.concat(chunks))).toEqual(expected);
  });

  test("formatS3Error() includes TLS, network, auth, and HTTP status diagnostics", () => {
    expect(formatS3Error("music", { cause: { code: "DEPTH_ZERO_SELF_SIGNED_CERT", message: "self-signed certificate" } }).message).toContain(
      "TLS certificate error",
    );
    expect(formatS3Error("music", { code: "ECONNREFUSED" }).message).toContain("ECONNREFUSED");
    expect(formatS3Error("music", { Code: "SignatureDoesNotMatch" }).message).toContain("SignatureDoesNotMatch");
    expect(formatS3Error("music", { Code: "SlowDown", $metadata: { httpStatusCode: 503 }, message: "Reduce your request rate" }).message).toContain(
      "503 SlowDown",
    );
  });
});
