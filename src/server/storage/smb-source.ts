import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { createAuthProvider } from "@winlinux/auth";
import {
  connect,
  SmbAbortError,
  SmbAccessDeniedError,
  SmbAuthError,
  SmbConnectionError,
  SmbDialectError,
  SmbEncryptionRequiredError,
  SmbError,
  SmbNotFoundError,
  SmbSigningError,
  SmbTimeoutError,
  type SMBSession,
} from "@winlinux/smb2";
import { parseFromTokenizer, selectCover, type IAudioMetadata, type IOptions } from "music-metadata";

import { canonicalSourcePath } from "~/lib/library-source";
import { audioTypes, coverFilePattern, suffixOf } from "~/server/library/audio";
import { parseRange } from "~/server/media/range";
import { decodePlaylistFile, parsePlaylistFile, playlistFilePattern, type PlaylistFile } from "~/server/playlists/playlist-file";
import { registerFfmpegStream } from "./ffmpeg-bridge";
import { RangeTokenizer } from "./s3-tokenizer";
import type { LibrarySource, ScannedFile } from "./types";

const STREAM_CHUNK_SIZE = 256 * 1024;
const SESSION_IDLE_MS = 2 * 60_000;
const COVER_STAT_TTL_MS = 5 * 60_000;

export type ResolvedSmbConfig = {
  host: string;
  share: string;
  subpath?: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  domain?: string | null;
};

type CachedSession = {
  session: SMBSession;
  timer: ReturnType<typeof setTimeout>;
};

const globalSmb = globalThis as unknown as {
  crateSmbSessions?: Map<string, CachedSession>;
  crateSmbConnecting?: Map<string, Promise<SMBSession>>;
  crateSmbCoverStat?: Map<string, { mtimeMs: number | null; expiresAt: number }>;
};
const sessionPool = (globalSmb.crateSmbSessions ??= new Map());
const connectingPool = (globalSmb.crateSmbConnecting ??= new Map());
const coverStatCache = (globalSmb.crateSmbCoverStat ??= new Map());

function sessionKeyOf(config: ResolvedSmbConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        host: config.host.trim().toLowerCase(),
        port: config.port ?? 445,
        username: config.username ?? null,
        password: config.password ?? null,
        domain: config.domain ?? null,
      }),
    )
    .digest("hex");
}

function touchIdleTimer(key: string, session: SMBSession) {
  const existing = sessionPool.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const current = sessionPool.get(key);
    if (current?.session === session) {
      sessionPool.delete(key);
      void session.close().catch(() => undefined);
    }
  }, SESSION_IDLE_MS);
  timer.unref();
  sessionPool.set(key, { session, timer });
}

export async function closeSmbSession(config: ResolvedSmbConfig): Promise<void> {
  const key = sessionKeyOf(config);
  const cached = sessionPool.get(key);
  if (cached) {
    clearTimeout(cached.timer);
    sessionPool.delete(key);
    await cached.session.close().catch(() => undefined);
  }
}

async function openSession(config: ResolvedSmbConfig): Promise<SMBSession> {
  const key = sessionKeyOf(config);
  const cached = sessionPool.get(key);
  if (cached) {
    touchIdleTimer(key, cached.session);
    return cached.session;
  }

  let inflight = connectingPool.get(key);
  if (!inflight) {
    inflight = (async () => {
      const session = await connect({
        host: config.host.trim(),
        port: config.port ?? 445,
        authProvider: createAuthProvider("ntlm"),
        credentials: {
          // NTLMv2 requires a non-empty username; "guest" with an empty password is the standard SMB guest login.
          username: config.username?.trim() || "guest",
          password: config.password ?? "",
          domain: config.domain?.trim() || "",
        },
        connectTimeoutMs: 15_000,
        requestTimeoutMs: 30_000,
      });
      touchIdleTimer(key, session);
      return session;
    })().finally(() => {
      connectingPool.delete(key);
    });
    connectingPool.set(key, inflight);
  }
  return inflight;
}

function isTransientSessionError(error: unknown): boolean {
  if (error instanceof SmbAbortError) return false;
  if (error instanceof SmbConnectionError || error instanceof SmbTimeoutError) return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  return msg.includes("closed") || msg.includes("destroyed") || msg.includes("econnreset") || msg.includes("epipe") || msg.includes("session expired");
}

function logSmbFailure(operation: string, config: ResolvedSmbConfig, error: unknown) {
  const err = error as { name?: string; message?: string; status?: number; code?: string; cause?: { code?: string; message?: string } };
  console.error(`[storage:smb] ${operation} failed`, {
    host: config.host,
    port: config.port ?? 445,
    share: config.share,
    subpath: config.subpath ?? "",
    username: config.username ? config.username : "(guest)",
    domain: config.domain ?? null,
    errorName: err.name ?? null,
    status: err.status ?? null,
    code: err.code ?? err.cause?.code ?? null,
    message: err.message ?? String(error),
  });
}

/** Translates SMB2/SMB3 protocol and network errors into clear, actionable messages. */
export function formatSmbError(config: Pick<ResolvedSmbConfig, "host" | "share" | "subpath" | "port">, error: unknown): Error {
  const detail = error instanceof Error ? error.message.trim() : "";

  if (error instanceof SmbAuthError) {
    return new Error(`The SMB server rejected the username or password (${detail}).`);
  }
  if (error instanceof SmbEncryptionRequiredError) {
    return new Error(`Share "${config.share}" requires SMB3 encryption (${detail}).`);
  }
  if (error instanceof SmbAccessDeniedError) {
    return new Error(`Access denied on SMB share "${config.share}". Check the user's share and folder permissions (${detail}).`);
  }
  if (error instanceof SmbNotFoundError) {
    return new Error(
      config.subpath
        ? `Share "${config.share}" or subfolder "${config.subpath}" was not found on ${config.host} (${detail}).`
        : `Share "${config.share}" was not found on ${config.host} (${detail}).`,
    );
  }
  if (error instanceof SmbTimeoutError) {
    return new Error(`Timed out connecting to SMB server ${config.host}:${config.port ?? 445} (${detail}).`);
  }
  if (error instanceof SmbConnectionError) {
    return new Error(`Could not connect to SMB server ${config.host}:${config.port ?? 445}. Check the host, port, and network (${detail}).`);
  }
  if (error instanceof SmbSigningError || error instanceof SmbDialectError) {
    return new Error(`SMB protocol negotiation failed with ${config.host} (${detail}).`);
  }
  if (error instanceof SmbError) {
    return new Error(`SMB error on ${config.host}/${config.share}: ${detail}`);
  }
  return new Error(detail || `Could not connect to SMB share //${config.host}/${config.share}.`);
}

function joinSmbPath(...parts: (string | undefined)[]): string {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/**
 * Library source backed directly by SMB2/SMB3 over TCP (userspace, no OS mount,
 * no root or CAP_SYS_ADMIN required — works identically in Docker, Dokploy,
 * Linux, and macOS).
 */
export class SmbLibrarySource implements LibrarySource {
  readonly type = "smb" as const;
  readonly canonicalPath: string;
  private readonly subpath: string;

  constructor(private readonly config: ResolvedSmbConfig) {
    this.subpath = config.subpath ? config.subpath.replace(/^\/+|\/+$/g, "") : "";
    this.canonicalPath = canonicalSourcePath({
      type: "smb",
      host: config.host,
      share: config.share,
      subpath: this.subpath,
      port: config.port ?? null,
    });
  }

  private sharePathOf(relPath: string): string {
    return joinSmbPath(this.subpath, relPath);
  }

  private relPathFromStored(storedPath: string): string | null {
    const prefix = `${this.canonicalPath}/`;
    if (!storedPath.startsWith(prefix)) return null;
    return storedPath.slice(prefix.length);
  }

  private coverCacheKey(sharePath: string): string {
    return `${this.canonicalPath}\0${sharePath}`;
  }

  /** Runs an SMB operation on a pooled session, retrying once on a dropped connection. */
  private async withSession<T>(operation: string, work: (session: SMBSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const key = sessionKeyOf(this.config);
    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await openSession(this.config);
      try {
        const result = await work(session);
        touchIdleTimer(key, session);
        return result;
      } catch (error) {
        if (attempt === 0 && !signal?.aborted && isTransientSessionError(error)) {
          await closeSmbSession(this.config);
          continue;
        }
        throw error;
      }
    }
    throw new Error(`SMB ${operation} failed after retry.`);
  }

  async check(): Promise<{ detail?: string }> {
    try {
      const { entries, dialect } = await this.withSession("check", async (session) => {
        const list = await session.list(this.config.share, this.subpath);
        return { entries: list, dialect: session.security.dialect };
      });
      const visible = entries.filter((entry) => entry.name !== "." && entry.name !== ".." && !entry.name.startsWith(".")).length;
      const proto = dialect ? ` (SMB ${dialect})` : "";
      return { detail: `Connected to SMB share${proto}. Found ${visible} ${visible === 1 ? "item" : "items"} at the top level.` };
    } catch (error) {
      logSmbFailure("check", this.config, error);
      throw formatSmbError(this.config, error);
    }
  }

  async listAudioFiles(onFound: () => void): Promise<ScannedFile[]> {
    const found: ScannedFile[] = [];

    const walk = async (relDir: string) => {
      const shareDir = this.sharePathOf(relDir);
      const entries = await this.withSession("list", (session) => session.list(this.config.share, shareDir));
      const cover = entries.find((entry) => !entry.isDirectory && coverFilePattern.test(entry.name));
      const coverRel = cover ? (relDir ? `${relDir}/${cover.name}` : cover.name) : null;
      const coverPath = coverRel ? `${this.canonicalPath}/${coverRel}` : null;
      if (cover && coverRel) {
        coverStatCache.set(this.coverCacheKey(this.sharePathOf(coverRel)), {
          mtimeMs: Math.round(cover.mtime.getTime()),
          expiresAt: Date.now() + COVER_STAT_TTL_MS,
        });
      }

      const subdirs: string[] = [];
      for (const entry of entries) {
        if (entry.name === "." || entry.name === ".." || entry.name.startsWith(".")) continue;
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (entry.isDirectory) {
          subdirs.push(rel);
        } else if (suffixOf(entry.name) in audioTypes) {
          found.push({
            path: `${this.canonicalPath}/${rel}`,
            relPath: rel,
            size: Number(entry.sizeBytes),
            mtimeMs: Math.round(entry.mtime.getTime()),
            coverPath,
          });
          onFound();
        }
      }

      for (const subdir of subdirs) {
        await walk(subdir).catch((error: unknown) => console.warn(`[scan] skipped smb://${this.config.host}/${this.config.share}/${subdir}:`, error));
      }
    };

    try {
      await walk("");
    } catch (error) {
      logSmbFailure("listAudioFiles", this.config, error);
      throw formatSmbError(this.config, error);
    }
    return found;
  }

  private async readByteRange(relPath: string, start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
    const sharePath = this.sharePathOf(relPath);
    const length = Math.max(0, end - start + 1);
    if (length === 0) return new Uint8Array(0);
    return this.withSession("readRange", (session) => session.readRange(this.config.share, sharePath, start, length, { signal }), signal);
  }

  private createTokenizer(relPath: string, size: number, mimeType?: string): RangeTokenizer {
    return new RangeTokenizer((start, end) => this.readByteRange(relPath, start, end), { size, mimeType, path: relPath });
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
      const shareDir = this.sharePathOf(relDir);
      if (!shareDir) {
        await this.withSession("hasFolder", (session) => session.list(this.config.share, ""));
        return true;
      }
      const info = await this.withSession("hasFolder", (session) => session.stat(this.config.share, shareDir));
      return info.isDirectory;
    } catch {
      return false;
    }
  }

  async listPlaylistFiles(relDir: string): Promise<PlaylistFile[]> {
    const found: PlaylistFile[] = [];

    const walk = async (dir: string) => {
      const shareDir = this.sharePathOf(dir);
      const entries = await this.withSession("listPlaylistFiles", (session) => session.list(this.config.share, shareDir)).catch(() => []);
      for (const entry of entries) {
        if (entry.name === "." || entry.name === ".." || entry.name.startsWith(".")) continue;
        const relPath = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory) {
          await walk(relPath);
        } else if (playlistFilePattern.test(entry.name)) {
          const sharePath = this.sharePathOf(relPath);
          const bytes = await this.withSession("readPlaylist", (session) => session.readFile(this.config.share, sharePath)).catch(() => null);
          if (bytes) {
            found.push({ relPath, entries: parsePlaylistFile(decodePlaylistFile(bytes), { dir, libraryPath: this.canonicalPath }) });
          }
        }
      }
    };

    await walk(relDir);
    return found;
  }

  async fileExists(relPath: string): Promise<boolean> {
    try {
      const info = await this.withSession("fileExists", (session) => session.stat(this.config.share, this.sharePathOf(relPath)));
      return !info.isDirectory;
    } catch {
      return false;
    }
  }

  async statCover(coverPath: string): Promise<{ mtimeMs: number } | null> {
    const rel = this.relPathFromStored(coverPath);
    if (rel === null) return null;
    const sharePath = this.sharePathOf(rel);
    const cacheKey = this.coverCacheKey(sharePath);
    const cached = coverStatCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.mtimeMs === null ? null : { mtimeMs: cached.mtimeMs };
    }

    try {
      const info = await this.withSession("statCover", (session) => session.stat(this.config.share, sharePath));
      if (info.isDirectory) return null;
      const mtimeMs = Math.round(info.mtime.getTime());
      coverStatCache.set(cacheKey, { mtimeMs, expiresAt: Date.now() + COVER_STAT_TTL_MS });
      return { mtimeMs };
    } catch (error) {
      if (error instanceof SmbNotFoundError) {
        coverStatCache.set(cacheKey, { mtimeMs: null, expiresAt: Date.now() + COVER_STAT_TTL_MS });
      }
      return null;
    }
  }

  async readCoverInput(coverPath: string): Promise<string | Uint8Array | null> {
    const rel = this.relPathFromStored(coverPath);
    if (rel === null) return null;
    try {
      return await this.withSession("readCover", (session) => session.readFile(this.config.share, this.sharePathOf(rel)));
    } catch {
      return null;
    }
  }

  async readEmbeddedCover(relPath: string, size: number): Promise<Uint8Array | null> {
    let totalSize = size;
    if (!totalSize) {
      const info = await this.withSession("statTrack", (session) => session.stat(this.config.share, this.sharePathOf(relPath))).catch(() => null);
      totalSize = info ? Number(info.sizeBytes) : 0;
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
    let size = file.size;
    let lastModified = file.mtimeMs ? new Date(file.mtimeMs) : undefined;
    if (size === undefined || request.method === "HEAD") {
      try {
        const info = await this.withSession(
          "statStream",
          (session) => session.stat(this.config.share, this.sharePathOf(file.relPath), { signal: request.signal }),
          request.signal,
        );
        if (info.isDirectory) return new Response("Not found", { status: 404 });
        size = Number(info.sizeBytes);
        lastModified = info.mtime;
      } catch (error) {
        if (error instanceof SmbNotFoundError) return new Response("Not found", { status: 404 });
        logSmbFailure("fileResponse.stat", this.config, error);
        return new Response("Unavailable", { status: 502 });
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

    const range = parseRange(request.headers.get("range"), size);
    if (range === "unsatisfiable") {
      headers.set("Content-Range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    const { start, end } = range === "all" ? { start: 0, end: size - 1 } : range;
    const length = size === 0 ? 0 : end - start + 1;
    headers.set("Content-Length", String(length));
    if (range !== "all") headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    const status = range === "all" ? 200 : 206;

    if (request.method === "HEAD" || length === 0) return new Response(null, { status, headers });

    let offset = start;
    const body = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (offset > end || request.signal.aborted) {
          controller.close();
          return;
        }
        try {
          const chunkEnd = Math.min(end, offset + STREAM_CHUNK_SIZE - 1);
          const data = await this.readByteRange(file.relPath, offset, chunkEnd, request.signal);
          if (!data.byteLength) {
            controller.close();
            return;
          }
          offset += data.byteLength;
          controller.enqueue(data);
          if (offset > end) controller.close();
        } catch (error) {
          if (request.signal.aborted || error instanceof SmbAbortError) {
            controller.close();
            return;
          }
          controller.error(error);
        }
      },
    });

    return new Response(body, { status, headers });
  }

  async ffmpegInput(relPath: string): Promise<{ input: string; preInputArgs?: string[] }> {
    const info = await this.withSession("ffmpegStat", (session) => session.stat(this.config.share, this.sharePathOf(relPath)));
    const suffix = suffixOf(relPath);
    const url = await registerFfmpegStream({
      size: Number(info.sizeBytes),
      contentType: audioTypes[suffix] ?? "application/octet-stream",
      readRange: (start, end, signal) => this.readByteRange(relPath, start, end, signal),
    });
    return { input: url };
  }

  async openReadStream(relPath: string, signal?: AbortSignal): Promise<Readable> {
    const info = await this.withSession("openReadStream", (session) => session.stat(this.config.share, this.sharePathOf(relPath), { signal }), signal);
    const total = Number(info.sizeBytes);
    const readByteRange = (start: number, end: number) => this.readByteRange(relPath, start, end, signal);

    async function* chunks() {
      let offset = 0;
      while (offset < total && !signal?.aborted) {
        const end = Math.min(total - 1, offset + STREAM_CHUNK_SIZE - 1);
        const data = await readByteRange(offset, end);
        if (!data.byteLength) break;
        offset += data.byteLength;
        yield data;
      }
    }

    return Readable.from(chunks());
  }
}
