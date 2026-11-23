import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "~/env";
import {
  canonicalSourcePath,
  isValidHost,
  isValidShareName,
  nfsVersions,
  normalizeEndpoint,
  normalizeExportPath,
  normalizeSubpath,
  parseMountOptions,
  publicSourceConfig,
  sourcesOverlap,
  type LibrarySourceType,
  type StoredNfsConfig,
  type StoredS3Config,
  type StoredSmbConfig,
  type StoredSourceConfig,
} from "~/lib/library-source";
import { recordActivity } from "~/server/activity";
import { db } from "~/server/db";
import { album, folderRule, library, libraryAccess, playlist, track } from "~/server/db/app-schema";
import { user } from "~/server/db/schema";
import { removeUnusedArtists, scanProgress, startScan } from "~/server/library/scanner";
import { encryptSecret } from "~/server/storage/crypto";
import { openLibrarySource, releaseLibrarySource, resolveS3Config, resolveSmbConfig, testSourceConnection } from "~/server/storage";
import { buildNfsMountCommand, mountsRoot } from "~/server/storage/mount";
import { S3LibrarySource } from "~/server/storage/s3-source";
import { SmbLibrarySource } from "~/server/storage/smb-source";
import { adminProcedure, router } from "../../trpc";

const id = z.number().int();
const name = z.string().trim().min(1, "Give it a name.").max(60);

const localSourceInput = z.object({
  type: z.literal("local"),
  path: z.string().trim().min(1, "Enter the folder's path."),
});

const s3SourceInput = z.object({
  type: z.literal("s3"),
  bucket: z.string().trim().min(1, "Enter the bucket name.").max(255),
  region: z.string().trim().min(1, "Enter the region.").max(64).default("us-east-1"),
  endpoint: z.string().trim().max(500).optional(),
  prefix: z.string().trim().max(500).optional(),
  accessKeyId: z.string().trim().max(255).optional(),
  secretAccessKey: z.string().max(500).optional(),
  clearCredentials: z.boolean().optional(),
  forcePathStyle: z.boolean().optional(),
});

const smbSourceInput = z.object({
  type: z.literal("smb"),
  host: z.string().trim().min(1, "Enter the server host or IP.").max(253),
  share: z.string().trim().min(1, "Enter the share name.").max(255),
  subpath: z.string().trim().max(500).optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  username: z.string().trim().max(255).optional(),
  password: z.string().max(500).optional(),
  clearPassword: z.boolean().optional(),
  domain: z.string().trim().max(255).optional(),
});

const nfsSourceInput = z.object({
  type: z.literal("nfs"),
  host: z.string().trim().min(1, "Enter the server host or IP.").max(253),
  exportPath: z.string().trim().min(1, "Enter the export path.").max(500),
  subpath: z.string().trim().max(500).optional(),
  version: z.enum(nfsVersions).default("auto"),
  options: z.string().trim().max(500).optional(),
});

const sourceInput = z.discriminatedUnion("type", [localSourceInput, s3SourceInput, smbSourceInput, nfsSourceInput]);
type SourceInput = z.infer<typeof sourceInput>;

type PreparedSource = {
  sourceType: LibrarySourceType;
  path: string;
  sourceConfig: StoredSourceConfig | null;
};

/** Validates and normalizes source settings, encrypting any new secrets while preserving existing ones when left blank. */
function prepareSource(input: SourceInput, existing?: { sourceType: LibrarySourceType; sourceConfig: StoredSourceConfig | null }): PreparedSource {
  if (input.type === "local") {
    if (!path.isAbsolute(input.path)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Use a full path, starting with /." });
    }
    const folder = path.resolve(input.path);
    const managedMounts = mountsRoot(env.DATA_DIR);
    if (folder === managedMounts || folder.startsWith(`${managedMounts}${path.sep}`)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a folder outside Crate's managed mounts directory." });
    }
    return { sourceType: "local", path: folder, sourceConfig: null };
  }

  if (input.type === "s3") {
    if (!/^[a-zA-Z0-9._-]+$/.test(input.bucket)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Bucket names may only contain letters, numbers, dots, hyphens, and underscores." });
    }
    let endpoint: string | null;
    try {
      endpoint = normalizeEndpoint(input.endpoint);
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid endpoint URL." });
    }
    const prefix = normalizeSubpath(input.prefix ?? "");
    if (prefix === null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The prefix can't contain \"..\" or control characters." });
    }

    const prev = existing?.sourceType === "s3" ? (existing.sourceConfig as StoredS3Config | null) : null;
    let accessKeyId: string | null = null;
    let secretAccessKeyEnc: string | null = null;

    if (!input.clearCredentials) {
      accessKeyId = input.accessKeyId?.trim() || null;
      const newSecret = input.secretAccessKey?.trim() || null;
      if (newSecret && !accessKeyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter an access key ID along with the secret access key." });
      }
      if (accessKeyId) {
        if (newSecret) {
          secretAccessKeyEnc = encryptSecret(newSecret);
        } else if (prev?.secretAccessKeyEnc) {
          secretAccessKeyEnc = prev.secretAccessKeyEnc;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the secret access key for this access key ID." });
        }
      }
    }

    const config: StoredS3Config = {
      bucket: input.bucket,
      region: input.region,
      endpoint,
      prefix,
      accessKeyId,
      secretAccessKeyEnc,
      forcePathStyle: input.forcePathStyle ?? Boolean(endpoint),
    };
    return {
      sourceType: "s3",
      path: canonicalSourcePath({ type: "s3", bucket: config.bucket, endpoint, prefix }),
      sourceConfig: config,
    };
  }

  if (input.type === "smb") {
    if (!isValidHost(input.host)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid host name or IP address." });
    }
    if (!isValidShareName(input.share)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid SMB share name (without slashes)." });
    }
    const subpath = normalizeSubpath(input.subpath ?? "");
    if (subpath === null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The subfolder can't contain \"..\" or control characters." });
    }

    const prev = existing?.sourceType === "smb" ? (existing.sourceConfig as StoredSmbConfig | null) : null;
    const username = input.username?.trim() || null;
    const domain = username ? input.domain?.trim() || null : null;
    let passwordEnc: string | null = null;
    if (username && !input.clearPassword) {
      const newPassword = input.password || null;
      if (newPassword) passwordEnc = encryptSecret(newPassword);
      else if (prev?.passwordEnc) passwordEnc = prev.passwordEnc;
    }

    const port = input.port && input.port !== 445 ? input.port : null;
    const config: StoredSmbConfig = {
      host: input.host.trim(),
      share: input.share.trim(),
      subpath,
      port,
      username,
      passwordEnc,
      domain,
    };
    return {
      sourceType: "smb",
      path: canonicalSourcePath({ type: "smb", host: config.host, share: config.share, subpath, port }),
      sourceConfig: config,
    };
  }

  if (!isValidHost(input.host)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid host name or IP address." });
  }
  const exportPath = normalizeExportPath(input.exportPath);
  if (!exportPath) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid NFS export path, starting with /." });
  }
  const subpath = normalizeSubpath(input.subpath ?? "");
  if (subpath === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The subfolder can't contain \"..\" or control characters." });
  }
  const parsedOpts = parseMountOptions(input.options);
  if (parsedOpts === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Mount options must be comma-separated key or key=value pairs." });
  }

  const config: StoredNfsConfig = {
    host: input.host.trim(),
    exportPath,
    subpath,
    version: input.version,
    options: parsedOpts.length ? parsedOpts.join(",") : null,
  };
  return {
    sourceType: "nfs",
    path: canonicalSourcePath({ type: "nfs", host: config.host, exportPath, subpath }),
    sourceConfig: config,
  };
}

/** Checks that a prepared source does not overlap any other library. */
async function assertNoOverlap(prepared: PreparedSource, exceptLibraryId?: number) {
  const others = await db
    .select({ id: library.id, name: library.name, path: library.path, sourceType: library.sourceType, sourceConfig: library.sourceConfig })
    .from(library)
    .where(exceptLibraryId === undefined ? undefined : ne(library.id, exceptLibraryId));
  const clash = others.find((other) => sourcesOverlap(prepared, other));
  if (clash) {
    throw new TRPCError({ code: "CONFLICT", message: `That source overlaps the ${clash.name} library.` });
  }
}

/** Verifies a prepared source can be reached right now, turning failures into BAD_REQUEST errors. */
async function checkReachable(prepared: PreparedSource): Promise<{ detail: string }> {
  try {
    if (prepared.sourceType === "local") {
      return await testSourceConnection({ type: "local", path: prepared.path });
    }
    if (prepared.sourceType === "s3") {
      return await testSourceConnection({ type: "s3", config: resolveS3Config(prepared.sourceConfig as StoredS3Config) });
    }
    if (prepared.sourceType === "smb") {
      return await testSourceConnection({ type: "smb", config: resolveSmbConfig(prepared.sourceConfig as StoredSmbConfig) });
    }
    return await testSourceConnection({ type: "nfs", config: prepared.sourceConfig as StoredNfsConfig });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect to that source.";
    console.warn(`[libraries] connection check failed`, {
      sourceType: prepared.sourceType,
      path: prepared.path,
      error: message,
    });
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }
}

/** Verifies at least one sampled track from a moved library exists at the new location. */
async function verifySampleTracksExist(prepared: PreparedSource, relPaths: string[]): Promise<boolean> {
  if (!relPaths.length) return true;
  if (prepared.sourceType === "local") {
    const found = await Promise.all(
      relPaths.map((rel) => stat(path.join(prepared.path, ...rel.split("/"))).then((info) => info.isFile(), () => false)),
    );
    return found.includes(true);
  }
  if (prepared.sourceType === "s3") {
    const s3 = new S3LibrarySource(resolveS3Config(prepared.sourceConfig as StoredS3Config));
    const found = await Promise.all(relPaths.map((rel) => s3.fileExists(rel)));
    return found.includes(true);
  }
  if (prepared.sourceType === "smb") {
    const smb = new SmbLibrarySource(resolveSmbConfig(prepared.sourceConfig as StoredSmbConfig));
    const found = await Promise.all(relPaths.map((rel) => smb.fileExists(rel)));
    return found.includes(true);
  }
  // For NFS, temporarily mount the new target and check sample files inside it.
  const nfs = prepared.sourceConfig as StoredNfsConfig;
  return checkSampleInTempMount(
    "nfs",
    (mountPoint) => buildNfsMountCommand(nfs, mountPoint),
    nfs.subpath,
    relPaths,
  );
}

async function checkSampleInTempMount(
  kind: "smb" | "nfs",
  build: (mountPoint: string, credFilePath: string) => ReturnType<typeof buildNfsMountCommand>,
  subpath: string | undefined,
  relPaths: string[],
): Promise<boolean> {
  const { randomBytes } = await import("node:crypto");
  const { mkdir } = await import("node:fs/promises");
  const { executeMount, unmountPath } = await import("~/server/storage/mount");
  const root = mountsRoot(env.DATA_DIR);
  await mkdir(root, { recursive: true });
  const tempDir = path.join(root, `move-${randomBytes(8).toString("hex")}`);
  const credPath = path.join(root, `.cred-${randomBytes(8).toString("hex")}`);
  try {
    await executeMount(kind, tempDir, build(tempDir, credPath));
    const effective = subpath ? path.join(tempDir, ...subpath.split("/")) : tempDir;
    const results = await Promise.all(
      relPaths.map((rel) => stat(path.join(effective, ...rel.split("/"))).then((info) => info.isFile(), () => false)),
    );
    return results.includes(true);
  } finally {
    await unmountPath(tempDir);
  }
}

async function findLibrary(libraryId: number) {
  const [found] = await db.select().from(library).where(eq(library.id, libraryId));
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
  return found;
}

const counts = () => {
  const tracks = db
    .select({ libraryId: track.libraryId, total: count().as("tracks") })
    .from(track)
    .groupBy(track.libraryId)
    .as("tracks");
  const albums = db
    .select({ libraryId: album.libraryId, total: count().as("albums") })
    .from(album)
    .groupBy(album.libraryId)
    .as("albums");
  const people = db
    .select({ libraryId: libraryAccess.libraryId, total: count().as("people") })
    .from(libraryAccess)
    .groupBy(libraryAccess.libraryId)
    .as("people");
  return db
    .select({
      id: library.id,
      name: library.name,
      path: library.path,
      sourceType: library.sourceType,
      sourceConfig: library.sourceConfig,
      createdAt: library.createdAt,
      lastScanAt: library.lastScanAt,
      lastScan: library.lastScan,
      trackCount: sql<number>`coalesce(${tracks.total}, 0)::int`,
      albumCount: sql<number>`coalesce(${albums.total}, 0)::int`,
      userCount: sql<number>`coalesce(${people.total}, 0)::int`,
      /** Folder rules on this library. */
      ruleCount: sql<number>`(select count(*) from ${folderRule} where ${folderRule.libraryId} = ${library.id})::int`,
    })
    .from(library)
    .leftJoin(tracks, eq(tracks.libraryId, library.id))
    .leftJoin(albums, eq(albums.libraryId, library.id))
    .leftJoin(people, eq(people.libraryId, library.id));
};

function serializeLibrary<T extends { sourceType: LibrarySourceType; sourceConfig: StoredSourceConfig | null }>(row: T) {
  const { sourceConfig, ...rest } = row;
  return {
    ...rest,
    source: publicSourceConfig(row.sourceType, sourceConfig),
  };
}

export const librariesRouter = router({
  /** Every library with its counts, and the scan that is running, if one is. */
  list: adminProcedure.query(async () => ({
    libraries: (await counts().orderBy(library.name)).map(serializeLibrary),
    scan: scanProgress(),
  })),

  /** Just the names, for pickers. */
  options: adminProcedure.query(() =>
    db
      .select({ id: library.id, name: library.name, path: library.path, sourceType: library.sourceType })
      .from(library)
      .orderBy(library.name),
  ),

  /** One library: its counts, everyone with what they can do in it, and the scan that is running, if one is. */
  byId: adminProcedure.input(z.object({ id })).query(async ({ input }) => {
    const [found] = await counts().where(eq(library.id, input.id));
    if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
    const access = await db
      .select({
        userId: user.id,
        username: sql<string>`coalesce(${user.username}, ${user.name})`,
        name: user.name,
        isAdmin: sql<boolean>`${user.role} = 'admin'`,
        granted: sql<boolean>`${libraryAccess.userId} is not null`,
        canDownload: sql<boolean>`coalesce(${libraryAccess.canDownload}, false)`,
      })
      .from(user)
      .leftJoin(libraryAccess, and(eq(libraryAccess.userId, user.id), eq(libraryAccess.libraryId, input.id)))
      .orderBy(asc(sql`lower(coalesce(${user.username}, ${user.name}))`));
    return { ...serializeLibrary(found), access, scan: scanProgress() };
  }),

  /** Folders at a path on the server, for picking a local library's folder. Hidden folders are left out. */
  browse: adminProcedure.input(z.object({ path: z.string().default("/") })).query(async ({ input }) => {
    const here = path.resolve(path.isAbsolute(input.path) ? input.path : "/");
    const entries = await readdir(here, { withFileTypes: true }).catch(() => null);
    if (!entries) throw new TRPCError({ code: "BAD_REQUEST", message: "The server can't open that folder." });
    const sorter = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    return {
      path: here,
      parent: here === path.parse(here).root ? null : path.dirname(here),
      folders: entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => ({ name: entry.name, path: path.join(here, entry.name) }))
        .sort((a, b) => sorter.compare(a.name, b.name)),
    };
  }),

  /**
   * The folders inside a library that hold music, from what is already
   * scanned, each with the tracks directly in it. Paths are relative to the
   * library, "" being the library's own folder.
   */
  folders: adminProcedure.input(z.object({ id })).query(async ({ input }) => {
    const dir = sql<string>`case when position('/' in ${track.relPath}) = 0 then '' else regexp_replace(${track.relPath}, '/[^/]*$', '') end`;
    const rows = await db
      .select({ path: dir, tracks: count() })
      .from(track)
      .where(eq(track.libraryId, input.id))
      .groupBy(dir);
    // Folders that only hold other folders have no tracks of their own, so they are added here.
    const folders = new Map(rows.map((row) => [row.path, row.tracks]));
    for (const row of rows) {
      for (let at = row.path; at.includes("/"); ) {
        at = at.slice(0, at.lastIndexOf("/"));
        if (!folders.has(at)) folders.set(at, 0);
      }
    }
    if (rows.length && !folders.has("")) folders.set("", 0);
    const sorter = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    return [...folders].map(([folder, tracks]) => ({ path: folder, tracks })).sort((a, b) => sorter.compare(a.path, b.path));
  }),

  /** Tests whether a local folder, S3 bucket, SMB share, or NFS share is reachable before saving. */
  testConnection: adminProcedure
    .input(z.object({ source: sourceInput, libraryId: id.optional() }))
    .mutation(async ({ input }) => {
      const existing = input.libraryId === undefined ? undefined : await findLibrary(input.libraryId);
      const prepared = prepareSource(input.source, existing);
      return checkReachable(prepared);
    }),

  create: adminProcedure.input(z.object({ name, source: sourceInput })).mutation(async ({ ctx, input }) => {
    const prepared = prepareSource(input.source);
    await assertNoOverlap(prepared);
    await checkReachable(prepared);
    const [created] = await db
      .insert(library)
      .values({
        name: input.name,
        path: prepared.path,
        sourceType: prepared.sourceType,
        sourceConfig: prepared.sourceConfig,
      })
      .returning({ id: library.id });
    await recordActivity({
      action: "library.created",
      actor: ctx.actor,
      target: input.name,
      detail: { sourceType: prepared.sourceType, path: prepared.path },
      headers: ctx.headers,
    });
    startScan({ libraryIds: [created!.id], actor: ctx.actor });
    return created!;
  }),

  /**
   * Renames a library, updates its source credentials/settings, or points it at
   * where its files moved. Tracks keep their ids through a move, so playlists,
   * likes and play counts survive; a scan then picks up anything that differs.
   */
  update: adminProcedure
    .input(z.object({ id, name: name.optional(), source: sourceInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const found = await findLibrary(input.id);
      let prepared: PreparedSource = {
        sourceType: found.sourceType,
        path: found.path,
        sourceConfig: found.sourceConfig,
      };
      let configChanged = false;

      if (input.source) {
        if (input.source.type !== found.sourceType) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A library's source type can't be changed. Add a new library instead." });
        }
        prepared = prepareSource(input.source, found);
        configChanged = JSON.stringify(prepared.sourceConfig) !== JSON.stringify(found.sourceConfig);
      }

      const moved = prepared.path !== found.path;
      if ((moved || configChanged) && scanProgress()) {
        throw new TRPCError({ code: "CONFLICT", message: "Wait for the scan to finish." });
      }

      if (moved) {
        await assertNoOverlap(prepared, input.id);
        await checkReachable(prepared);
        const sample = await db.select({ relPath: track.relPath }).from(track).where(eq(track.libraryId, input.id)).limit(25);
        const hasMatch = await verifySampleTracksExist(
          prepared,
          sample.map((row) => row.relPath),
        );
        if (!hasMatch) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "None of this library's files are at that location. Pick where they were moved to, or add it as a new library.",
          });
        }
      } else if (configChanged) {
        await checkReachable(prepared);
      }

      await db.transaction(async (tx) => {
        await tx
          .update(library)
          .set({ name: input.name, path: prepared.path, sourceConfig: prepared.sourceConfig })
          .where(eq(library.id, input.id));
        if (!moved) return;
        const rest = (column: typeof track.path | typeof album.coverPath) =>
          sql`${prepared.path} || substr(${column}, char_length(${found.path}) + 1)`;
        await tx.update(track).set({ path: rest(track.path) }).where(eq(track.libraryId, input.id));
        await tx.update(album).set({ coverPath: rest(album.coverPath) }).where(eq(album.libraryId, input.id));
      });

      // Release the old SMB session or NFS mount so the next scan or stream uses the new settings.
      if ((moved || configChanged) && (found.sourceType === "smb" || found.sourceType === "nfs")) {
        await releaseLibrarySource(found);
      }

      await recordActivity({
        action: "library.updated",
        actor: ctx.actor,
        target: input.name ?? found.name,
        detail: {
          ...(input.name && input.name !== found.name ? { name: input.name } : {}),
          ...(moved ? { path: prepared.path, was: found.path } : {}),
          ...(configChanged && !moved ? { sourceUpdated: true } : {}),
        },
        headers: ctx.headers,
      });

      if (moved || (configChanged && found.lastScan?.error)) {
        startScan({ libraryIds: [input.id], actor: ctx.actor });
      }
    }),

  /**
   * Re-mounts an SMB or NFS library (useful if a NAS rebooted and left a stale mount).
   */
  reconnect: adminProcedure.input(z.object({ id })).mutation(async ({ input }) => {
    const found = await findLibrary(input.id);
    if (found.sourceType !== "smb" && found.sourceType !== "nfs") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only SMB and NFS libraries need reconnecting." });
    }
    if (scanProgress()?.libraryId === input.id) {
      throw new TRPCError({ code: "CONFLICT", message: "Wait for the scan to finish." });
    }
    await releaseLibrarySource(found);
    try {
      return await openLibrarySource(found).check();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reconnect to the share.";
      console.warn(`[libraries] reconnect failed`, {
        libraryId: found.id,
        sourceType: found.sourceType,
        path: found.path,
        error: message,
      });
      throw new TRPCError({ code: "BAD_REQUEST", message });
    }
  }),

  /**
   * Removes the library and its tracks from the server, along with the
   * playlists its folder rules made. Left to the database those would only
   * lose their rule and stay behind, empty and read-only. Source files are untouched.
   */
  delete: adminProcedure.input(z.object({ id })).mutation(async ({ ctx, input }) => {
    if (scanProgress()) throw new TRPCError({ code: "CONFLICT", message: "Wait for the scan to finish." });
    const removed = await db.transaction(async (tx) => {
      const rules = tx.select({ id: folderRule.id }).from(folderRule).where(eq(folderRule.libraryId, input.id));
      await tx.delete(playlist).where(inArray(playlist.ruleId, rules));
      const [row] = await tx.delete(library).where(eq(library.id, input.id)).returning();
      return row;
    });
    if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Library not found." });
    if (removed.sourceType === "smb" || removed.sourceType === "nfs") {
      await releaseLibrarySource(removed);
    }
    await removeUnusedArtists();
    await recordActivity({
      action: "library.deleted",
      actor: ctx.actor,
      target: removed.name,
      detail: { sourceType: removed.sourceType, path: removed.path },
      headers: ctx.headers,
    });
  }),

  /**
   * Starts a scan of one library, or all of them. `full` reads every file
   * again instead of only new and changed ones. Progress comes back through `list` and `byId`.
   */
  scan: adminProcedure.input(z.object({ id: id.optional(), full: z.boolean().default(false) })).mutation(({ ctx, input }) => {
    const started = startScan({ libraryIds: input.id === undefined ? undefined : [input.id], full: input.full, actor: ctx.actor });
    if (!started) throw new TRPCError({ code: "CONFLICT", message: "A scan is already running." });
  }),
});
