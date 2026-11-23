import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { parseFromTokenizer, selectCover, type IAudioMetadata, type IOptions } from "music-metadata";

import { canonicalSourcePath } from "~/lib/library-source";
import { audioTypes, coverFilePattern, suffixOf } from "~/server/library/audio";
import { parseRange } from "~/server/media/range";
import { decodePlaylistFile, parsePlaylistFile, playlistFilePattern, type PlaylistFile } from "~/server/playlists/playlist-file";
import { RangeTokenizer } from "./s3-tokenizer";
import type { LibrarySource, ScannedFile } from "./types";

export type ResolvedS3Config = {
  bucket: string;
  region: string;
  endpoint?: string | null;
  prefix?: string;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  forcePathStyle?: boolean;
};

// Reuse S3Client instances across requests and Next.js dev hot reloads.
const clientCache = (globalThis as unknown as { crateS3Clients?: Map<string, S3Client> }).crateS3Clients ?? new Map<string, S3Client>();
(globalThis as unknown as { crateS3Clients?: Map<string, S3Client> }).crateS3Clients = clientCache;

// Short-lived cover stat cache so browsing album grids doesn't hammer S3 with HeadObject calls.
const COVER_STAT_TTL_MS = 5 * 60_000;
const coverStatCache =
  (globalThis as unknown as { crateS3CoverStat?: Map<string, { mtimeMs: number | null; expiresAt: number }> }).crateS3CoverStat ??
  new Map<string, { mtimeMs: number | null; expiresAt: number }>();
(globalThis as unknown as { crateS3CoverStat?: Map<string, { mtimeMs: number | null; expiresAt: number }> }).crateS3CoverStat = coverStatCache;

function clientFor(config: ResolvedS3Config): S3Client {
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        region: config.region,
        endpoint: config.endpoint ?? null,
        accessKeyId: config.accessKeyId ?? null,
        secretAccessKey: config.secretAccessKey ?? null,
        forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      }),
    )
    .digest("hex");

  const existing = clientCache.get(cacheKey);
  if (existing) return existing;

  const client = new S3Client({
    region: config.region || "us-east-1",
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
    // Keep wide compatibility with S3-compatible providers (R2, MinIO, B2, Wasabi, Garage, etc.).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  if (clientCache.size > 32) {
    const oldest = clientCache.keys().next().value;
    if (oldest) clientCache.delete(oldest);
  }
  clientCache.set(cacheKey, client);
  return client;
}

type S3LikeError = {
  name?: string;
  Code?: string;
  $metadata?: { httpStatusCode?: number; requestId?: string };
  message?: string;
  code?: string;
  cause?: { code?: string; message?: string };
};

/** Translates AWS SDK / network errors into concise admin-facing messages with diagnostic detail. */
export function formatS3Error(bucket: string, error: unknown): Error {
  const err = error as S3LikeError;
  const code = err.Code ?? err.name ?? "";
  const netCode = err.code ?? err.cause?.code ?? "";
  const status = err.$metadata?.httpStatusCode;
  const detail = err.message?.trim() || err.cause?.message?.trim() || "";

  if (code === "NoSuchBucket") return new Error(`Bucket "${bucket}" was not found.`);
  if (code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch") {
    return new Error(`The S3 access key or secret key was rejected (${code}).`);
  }
  if (code === "AccessDenied" || status === 403) {
    return new Error(`Access denied by S3 for bucket "${bucket}". Check the credentials and bucket permissions (${code || 403}).`);
  }
  if (code === "PermanentRedirect" || code === "AuthorizationHeaderMalformed" || status === 301) {
    return new Error(`Wrong region or endpoint for bucket "${bucket}"${detail ? ` (${detail})` : ""}.`);
  }
  if (
    netCode === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    netCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    netCode === "SELF_SIGNED_CERT_IN_CHAIN" ||
    netCode === "CERT_HAS_EXPIRED" ||
    netCode === "ERR_TLS_CERT_ALTNAME_INVALID"
  ) {
    return new Error(`TLS certificate error connecting to the S3 endpoint (${netCode}${detail ? `: ${detail}` : ""}).`);
  }
  if (
    netCode === "ECONNREFUSED" ||
    netCode === "ENOTFOUND" ||
    netCode === "ETIMEDOUT" ||
    netCode === "EHOSTUNREACH" ||
    netCode === "ECONNRESET" ||
    code === "TimeoutError"
  ) {
    return new Error(`Could not reach the S3 endpoint (${netCode || code}). Check the endpoint URL, port, and network.`);
  }
  const tag = [status, code].filter(Boolean).join(" ");
  if (detail && tag) return new Error(`Could not connect to S3 bucket "${bucket}" (${tag}: ${detail}).`);
  return new Error(detail || `Could not connect to S3 bucket "${bucket}".`);
}

function logS3Failure(operation: string, config: ResolvedS3Config, error: unknown) {
  const err = error as S3LikeError;
  console.error(`[storage:s3] ${operation} failed`, {
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint ?? null,
    prefix: config.prefix ?? "",
    forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    hasCredentials: Boolean(config.accessKeyId && config.secretAccessKey),
    code: err.Code ?? err.name ?? null,
    netCode: err.code ?? err.cause?.code ?? null,
    httpStatus: err.$metadata?.httpStatusCode ?? null,
    requestId: err.$metadata?.requestId ?? null,
    message: err.message ?? String(error),
  });
}

function isNotFoundError(error: unknown): boolean {
  const err = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const code = err.Code ?? err.name;
  return code === "NoSuchKey" || code === "NotFound" || err.$metadata?.httpStatusCode === 404;
}

function hasHiddenSegment(relPath: string): boolean {
  return relPath.split("/").some((part) => part.startsWith("."));
}

function dirAndBase(relPath: string): { dir: string; base: string } {
  const slash = relPath.lastIndexOf("/");
  return slash < 0 ? { dir: "", base: relPath } : { dir: relPath.slice(0, slash), base: relPath.slice(slash + 1) };
}

function bodyToWebStream(body: NonNullable<GetObjectCommandOutput["Body"]>, signal?: AbortSignal): ReadableStream<Uint8Array> {
  let stream: ReadableStream<Uint8Array>;
  if (typeof body.transformToWebStream === "function") {
    stream = body.transformToWebStream() as ReadableStream<Uint8Array>;
  } else {
    stream = Readable.toWeb(body as unknown as Readable) as unknown as ReadableStream<Uint8Array>;
  }
  if (signal) {
    signal.addEventListener("abort", () => {
      void stream.cancel().catch(() => undefined);
    });
  }
  return stream;
}

function bodyToNodeReadable(body: NonNullable<GetObjectCommandOutput["Body"]>): Readable {
  if (body instanceof Readable) return body;
  if (typeof body.transformToWebStream === "function") {
    return Readable.fromWeb(body.transformToWebStream() as unknown as Parameters<typeof Readable.fromWeb>[0]);
  }
  return body as unknown as Readable;
}

/** Library source backed by an S3 or S3-compatible bucket. */
export class S3LibrarySource implements LibrarySource {
  readonly type = "s3" as const;
  readonly canonicalPath: string;
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(private readonly config: ResolvedS3Config) {
    this.prefix = config.prefix ? config.prefix.replace(/^\/+|\/+$/g, "") : "";
    this.canonicalPath = canonicalSourcePath({
      type: "s3",
      bucket: config.bucket,
      endpoint: config.endpoint ?? null,
      prefix: this.prefix,
    });
    this.client = clientFor(config);
  }

  private keyOf(relPath: string): string {
    if (!this.prefix) return relPath;
    return relPath ? `${this.prefix}/${relPath}` : this.prefix;
  }

  private relPathOf(key: string): string | null {
    if (!this.prefix) return key;
    const prefixSlash = `${this.prefix}/`;
    if (!key.startsWith(prefixSlash)) return null;
    return key.slice(prefixSlash.length);
  }

  private relPathFromStored(storedPath: string): string | null {
    const prefix = `${this.canonicalPath}/`;
    if (!storedPath.startsWith(prefix)) return null;
    return storedPath.slice(prefix.length);
  }

  private coverCacheKey(key: string): string {
    return `${this.canonicalPath}\0${key}`;
  }

  async check(): Promise<{ detail?: string }> {
    try {
      const listPrefix = this.prefix ? `${this.prefix}/` : undefined;
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: listPrefix,
          MaxKeys: 100,
        }),
      );
      const count = res.Contents?.length ?? 0;
      if (count === 0) {
        return {
          detail: this.prefix
            ? `Connected to "${this.config.bucket}", though no objects exist under "${this.prefix}" yet.`
            : `Connected to "${this.config.bucket}" (bucket is currently empty).`,
        };
      }
      return { detail: `Connected to "${this.config.bucket}". Found ${res.IsTruncated ? "100+" : count} objects.` };
    } catch (error) {
      logS3Failure("check", this.config, error);
      throw formatS3Error(this.config.bucket, error);
    }
  }

  async listAudioFiles(onFound: () => void): Promise<ScannedFile[]> {
    const listPrefix = this.prefix ? `${this.prefix}/` : undefined;
    const coversByDir = new Map<string, string>();
    const rawAudio: { relPath: string; dir: string; size: number; mtimeMs: number }[] = [];

    let continuationToken: string | undefined;
    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: listPrefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of page.Contents ?? []) {
          if (!obj.Key || obj.Key.endsWith("/")) continue;
          const relPath = this.relPathOf(obj.Key);
          if (!relPath || hasHiddenSegment(relPath)) continue;
          const { dir, base } = dirAndBase(relPath);
          const mtimeMs = Math.round(obj.LastModified?.getTime() ?? 0);

          if (!coversByDir.has(dir) && coverFilePattern.test(base)) {
            coversByDir.set(dir, relPath);
            coverStatCache.set(this.coverCacheKey(obj.Key), { mtimeMs, expiresAt: Date.now() + COVER_STAT_TTL_MS });
          } else if (suffixOf(base) in audioTypes) {
            rawAudio.push({ relPath, dir, size: obj.Size ?? 0, mtimeMs });
            onFound();
          }
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
    } catch (error) {
      logS3Failure("listAudioFiles", this.config, error);
      throw formatS3Error(this.config.bucket, error);
    }

    return rawAudio.map((item) => {
      const coverRel = coversByDir.get(item.dir);
      return {
        path: `${this.canonicalPath}/${item.relPath}`,
        relPath: item.relPath,
        size: item.size,
        mtimeMs: item.mtimeMs,
        coverPath: coverRel ? `${this.canonicalPath}/${coverRel}` : null,
      };
    });
  }

  private createTokenizer(relPath: string, size: number, mimeType?: string): RangeTokenizer {
    const key = this.keyOf(relPath);
    return new RangeTokenizer(
      async (start, end) => {
        const res = await this.client.send(
          new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Range: `bytes=${start}-${end}`,
          }),
        );
        if (!res.Body) return new Uint8Array(0);
        return res.Body.transformToByteArray();
      },
      { size, mimeType, path: relPath },
    );
  }

  async parseMetadata(relPath: string, info: { size: number; mimeType?: string }, options?: IOptions): Promise<IAudioMetadata> {
    const tokenizer = this.createTokenizer(relPath, info.size, info.mimeType);
    try {
      return await parseFromTokenizer(tokenizer, options);
    } finally {
      await tokenizer.close();
    }
  }

  async hasFolder(relDir: string): Promise<boolean> {
    try {
      if (!relDir) {
        await this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: this.prefix ? `${this.prefix}/` : undefined, MaxKeys: 1 }));
        return true;
      }
      const prefix = `${this.keyOf(relDir)}/`;
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.config.bucket, Prefix: prefix, MaxKeys: 1 }));
      return (res.Contents?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  async listPlaylistFiles(relDir: string): Promise<PlaylistFile[]> {
    const targetPrefix = relDir ? `${this.keyOf(relDir)}/` : this.prefix ? `${this.prefix}/` : undefined;
    const found: PlaylistFile[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: targetPrefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of page.Contents ?? []) {
          if (!obj.Key || obj.Key.endsWith("/")) continue;
          const relPath = this.relPathOf(obj.Key);
          if (!relPath || hasHiddenSegment(relPath)) continue;
          const { dir, base } = dirAndBase(relPath);
          if (!playlistFilePattern.test(base)) continue;

          const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: obj.Key })).catch(() => null);
          const bytes = res?.Body ? await res.Body.transformToByteArray().catch(() => null) : null;
          if (bytes) {
            found.push({ relPath, entries: parsePlaylistFile(decodePlaylistFile(bytes), { dir, libraryPath: this.canonicalPath }) });
          }
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
    } catch (error) {
      console.warn(`[s3] could not list playlist files under ${this.canonicalPath}/${relDir}:`, error);
    }
    return found;
  }

  async fileExists(relPath: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.keyOf(relPath) }));
      return true;
    } catch {
      return false;
    }
  }

  async statCover(coverPath: string): Promise<{ mtimeMs: number } | null> {
    const rel = this.relPathFromStored(coverPath);
    if (rel === null) return null;
    const key = this.keyOf(rel);
    const cacheKey = this.coverCacheKey(key);
    const cached = coverStatCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.mtimeMs === null ? null : { mtimeMs: cached.mtimeMs };
    }

    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      const mtimeMs = Math.round(head.LastModified?.getTime() ?? 0);
      coverStatCache.set(cacheKey, { mtimeMs, expiresAt: Date.now() + COVER_STAT_TTL_MS });
      return { mtimeMs };
    } catch (error) {
      if (isNotFoundError(error)) {
        coverStatCache.set(cacheKey, { mtimeMs: null, expiresAt: Date.now() + COVER_STAT_TTL_MS });
      }
      return null;
    }
  }

  async readCoverInput(coverPath: string): Promise<string | Uint8Array | null> {
    const rel = this.relPathFromStored(coverPath);
    if (rel === null) return null;
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.keyOf(rel) }));
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch {
      return null;
    }
  }

  async readEmbeddedCover(relPath: string, size: number): Promise<Uint8Array | null> {
    let totalSize = size;
    if (!totalSize) {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.keyOf(relPath) })).catch(() => null);
      totalSize = head?.ContentLength ?? 0;
    }
    if (!totalSize) return null;
    const suffix = suffixOf(relPath);
    const meta = await this.parseMetadata(relPath, { size: totalSize, mimeType: audioTypes[suffix] }, { skipCovers: false }).catch(() => null);
    return selectCover(meta?.common.picture)?.data ?? null;
  }

  async fileResponse(
    request: Request,
    file: { relPath: string; size?: number; mtimeMs?: number; contentType: string },
    options: { downloadName?: string; cacheControl?: string } = {},
  ): Promise<Response> {
    const key = this.keyOf(file.relPath);
    const rangeHeader = request.headers.get("range");

    // HEAD or unknown size with Range: ask S3 for object metadata first.
    let size = file.size;
    let lastModified = file.mtimeMs ? new Date(file.mtimeMs) : undefined;
    if (request.method === "HEAD" || (rangeHeader && size === undefined)) {
      try {
        const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: request.signal });
        size = head.ContentLength ?? 0;
        lastModified = head.LastModified ?? lastModified;
      } catch (error) {
        if (isNotFoundError(error)) return new Response("Not found", { status: 404 });
        throw error;
      }
    }

    const headers = new Headers({
      "Content-Type": file.contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": options.cacheControl ?? "private, no-cache",
    });
    if (lastModified) headers.set("Last-Modified", lastModified.toUTCString());
    if (options.downloadName) {
      headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`);
    }

    if (rangeHeader && size !== undefined) {
      const range = parseRange(rangeHeader, size);
      if (range === "unsatisfiable") {
        headers.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      const { start, end } = range === "all" ? { start: 0, end: size - 1 } : range;
      if (request.method === "HEAD" || size === 0) {
        headers.set("Content-Length", String(size === 0 ? 0 : end - start + 1));
        if (range !== "all") headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
        return new Response(null, { status: range === "all" ? 200 : 206, headers });
      }

      try {
        const res = await this.client.send(
          new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Range: range === "all" ? undefined : `bytes=${start}-${end}`,
          }),
          { abortSignal: request.signal },
        );
        if (!res.Body) return new Response("Not found", { status: 404 });
        if (res.LastModified) headers.set("Last-Modified", res.LastModified.toUTCString());
        if (res.ContentLength !== undefined) headers.set("Content-Length", String(res.ContentLength));
        if (res.ContentRange) headers.set("Content-Range", res.ContentRange);
        else if (range !== "all") headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
        return new Response(bodyToWebStream(res.Body, request.signal), {
          status: range === "all" ? 200 : 206,
          headers,
        });
      } catch (error) {
        if (isNotFoundError(error)) return new Response("Not found", { status: 404 });
        throw error;
      }
    }

    if (request.method === "HEAD") {
      headers.set("Content-Length", String(size ?? 0));
      return new Response(null, { status: 200, headers });
    }

    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { abortSignal: request.signal });
      if (!res.Body) return new Response("Not found", { status: 404 });
      if (res.LastModified) headers.set("Last-Modified", res.LastModified.toUTCString());
      if (res.ContentLength !== undefined) headers.set("Content-Length", String(res.ContentLength));
      return new Response(bodyToWebStream(res.Body, request.signal), { status: 200, headers });
    } catch (error) {
      if (isNotFoundError(error)) return new Response("Not found", { status: 404 });
      throw error;
    }
  }

  async ffmpegInput(relPath: string): Promise<{ input: string; preInputArgs?: string[] }> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: this.keyOf(relPath) }),
      { expiresIn: 3600 },
    );
    return {
      input: url,
      preInputArgs: ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"],
    };
  }

  async openReadStream(relPath: string, signal?: AbortSignal): Promise<Readable> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: this.keyOf(relPath) }),
      { abortSignal: signal },
    );
    if (!res.Body) throw new Error("Object body is empty.");
    return bodyToNodeReadable(res.Body);
  }
}
