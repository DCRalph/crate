import { createReadStream } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { parseFile, selectCover, type IAudioMetadata, type IOptions } from "music-metadata";

import { audioTypes, coverFilePattern, suffixOf } from "~/server/library/audio";
import { fileResponse as localFileResponse } from "~/server/media/stream";
import { decodePlaylistFile, parsePlaylistFile, playlistFilePattern, type PlaylistFile } from "~/server/playlists/playlist-file";
import type { LibrarySource, ScannedFile } from "./types";

/**
 * Library source backed by a POSIX filesystem directory: used directly for
 * local folders and through managed mounts for SMB and NFS shares.
 */
export class FsLibrarySource implements LibrarySource {
  constructor(
    readonly type: "local" | "smb" | "nfs",
    readonly canonicalPath: string,
    private readonly resolveRoot: () => Promise<string>,
  ) {}

  private storedPathOf(relPath: string): string {
    if (this.type === "local") {
      return relPath ? path.join(this.canonicalPath, ...relPath.split("/")) : this.canonicalPath;
    }
    return relPath ? `${this.canonicalPath}/${relPath}` : this.canonicalPath;
  }

  private relPathFromStored(storedPath: string): string | null {
    if (this.type === "local") {
      const rel = path.relative(this.canonicalPath, storedPath).split(path.sep).join("/");
      if (rel.startsWith("..")) return null;
      return rel;
    }
    const prefix = `${this.canonicalPath}/`;
    if (!storedPath.startsWith(prefix)) return null;
    return storedPath.slice(prefix.length);
  }

  private async localPathOf(relPath: string): Promise<string> {
    const root = await this.resolveRoot();
    return relPath ? path.join(root, ...relPath.split("/")) : root;
  }

  async check(): Promise<{ detail?: string }> {
    const root = await this.resolveRoot();
    let info;
    try {
      info = await stat(root);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      console.error(`[storage:${this.type}] stat failed during check`, {
        path: this.canonicalPath,
        root,
        code: code ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      if (code === "ENOENT") throw new Error("The server can't find a folder at that path.");
      if (code === "EACCES" || code === "EPERM") {
        throw new Error(`Permission denied reading "${this.canonicalPath}" (uid ${process.getuid?.() ?? "?"}).`);
      }
      if (code === "ESTALE" || code === "EIO") {
        throw new Error(`The mount returned ${code} while reading "${this.canonicalPath}". Try reconnecting the share.`);
      }
      throw new Error(`The folder can't be read (${code ?? (error instanceof Error ? error.message : "unknown error")}).`);
    }
    if (!info.isDirectory()) {
      throw new Error("That path is a file, not a folder.");
    }
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      console.error(`[storage:${this.type}] readdir failed during check`, {
        path: this.canonicalPath,
        root,
        code: code ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      if (code === "EACCES" || code === "EPERM") {
        throw new Error(`Permission denied listing "${this.canonicalPath}" (uid ${process.getuid?.() ?? "?"}).`);
      }
      throw new Error(`The folder can't be listed (${code ?? (error instanceof Error ? error.message : "unknown error")}).`);
    }
    const visible = entries.filter((name) => !name.startsWith(".")).length;
    return { detail: `Connected. Found ${visible} ${visible === 1 ? "item" : "items"} at the top level.` };
  }

  async listAudioFiles(onFound: () => void): Promise<ScannedFile[]> {
    const root = await this.resolveRoot();
    const found: ScannedFile[] = [];
    // Symlinked folders are followed; this stops a link back up the tree looping forever.
    const visited = new Set<string>();

    const walk = async (dir: string, relDir: string) => {
      const real = await realpath(dir);
      if (visited.has(real)) return;
      visited.add(real);

      const entries = await readdir(dir, { withFileTypes: true });
      const cover = entries.find((entry) => coverFilePattern.test(entry.name));
      const coverRel = cover ? (relDir ? `${relDir}/${cover.name}` : cover.name) : null;
      const coverPath = coverRel ? this.storedPathOf(coverRel) : null;
      const subdirs: { full: string; rel: string }[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
        // stat follows symlinks, so linked files and folders count as what they point to.
        const info = entry.isSymbolicLink() ? await stat(full).catch(() => null) : null;
        const isDir = info ? info.isDirectory() : entry.isDirectory();
        const isFile = info ? info.isFile() : entry.isFile();
        if (isDir) subdirs.push({ full, rel });
        else if (isFile && suffixOf(entry.name) in audioTypes) {
          const fileInfo = info ?? (await stat(full));
          found.push({
            path: this.storedPathOf(rel),
            relPath: rel,
            size: fileInfo.size,
            mtimeMs: Math.round(fileInfo.mtimeMs),
            coverPath,
          });
          onFound();
        }
      }
      for (const subdir of subdirs) {
        // An unreadable folder shouldn't end the scan of everything else.
        await walk(subdir.full, subdir.rel).catch((error: unknown) => console.warn(`[scan] skipped ${subdir.full}:`, error));
      }
    };

    await walk(root, "");
    return found;
  }

  async parseMetadata(relPath: string, _info: { size: number; mimeType?: string }, options?: IOptions): Promise<IAudioMetadata> {
    const localPath = await this.localPathOf(relPath);
    return parseFile(localPath, options);
  }

  async hasFolder(relDir: string): Promise<boolean> {
    const target = await this.localPathOf(relDir).catch(() => null);
    if (!target) return false;
    const info = await stat(target).catch(() => null);
    return Boolean(info?.isDirectory());
  }

  async listPlaylistFiles(relDir: string): Promise<PlaylistFile[]> {
    const root = await this.resolveRoot().catch(() => null);
    if (!root) return [];
    const found: PlaylistFile[] = [];
    const visited = new Set<string>();

    const walk = async (dir: string) => {
      const target = dir ? path.join(root, ...dir.split("/")) : root;
      const real = await realpath(target).catch(() => null);
      if (!real || visited.has(real)) return;
      visited.add(real);

      for (const entry of await readdir(real, { withFileTypes: true }).catch(() => [])) {
        if (entry.name.startsWith(".")) continue;
        const relPath = dir ? `${dir}/${entry.name}` : entry.name;
        const full = path.join(root, ...relPath.split("/"));
        const info = entry.isSymbolicLink() ? await stat(full).catch(() => null) : entry;
        if (info?.isDirectory()) await walk(relPath);
        else if (info?.isFile() && playlistFilePattern.test(entry.name)) {
          const bytes = await readFile(full).catch(() => null);
          if (bytes) found.push({ relPath, entries: parsePlaylistFile(decodePlaylistFile(bytes), { dir, libraryPath: root }) });
        }
      }
    };

    await walk(relDir);
    return found;
  }

  async fileExists(relPath: string): Promise<boolean> {
    const localPath = await this.localPathOf(relPath).catch(() => null);
    if (!localPath) return false;
    const info = await stat(localPath).catch(() => null);
    return Boolean(info?.isFile());
  }

  async statCover(coverPath: string): Promise<{ mtimeMs: number } | null> {
    const rel = this.relPathFromStored(coverPath);
    if (rel === null) return null;
    const localPath = await this.localPathOf(rel).catch(() => null);
    if (!localPath) return null;
    const info = await stat(localPath).catch(() => null);
    return info?.isFile() ? { mtimeMs: Math.round(info.mtimeMs) } : null;
  }

  async readCoverInput(coverPath: string): Promise<string | Uint8Array | null> {
    const rel = this.relPathFromStored(coverPath);
    if (rel === null) return null;
    return this.localPathOf(rel).catch(() => null);
  }

  async readEmbeddedCover(relPath: string): Promise<Uint8Array | null> {
    const localPath = await this.localPathOf(relPath).catch(() => null);
    if (!localPath) return null;
    const picture = selectCover((await parseFile(localPath).catch(() => null))?.common.picture);
    return picture?.data ?? null;
  }

  async fileResponse(
    request: Request,
    file: { relPath: string; contentType: string },
    options?: { downloadName?: string; cacheControl?: string },
  ): Promise<Response> {
    const localPath = await this.localPathOf(file.relPath).catch(() => null);
    if (!localPath) return new Response("Not found", { status: 404 });
    return localFileResponse(request, localPath, file.contentType, options);
  }

  async ffmpegInput(relPath: string): Promise<{ input: string; preInputArgs?: string[] }> {
    return { input: await this.localPathOf(relPath) };
  }

  async openReadStream(relPath: string): Promise<Readable> {
    const localPath = await this.localPathOf(relPath);
    return createReadStream(localPath, { highWaterMark: 256 * 1024 });
  }
}
