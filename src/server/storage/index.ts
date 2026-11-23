import "server-only";
import { eq } from "drizzle-orm";

import { env } from "~/env";
import type { LibrarySourceType, StoredNfsConfig, StoredS3Config, StoredSmbConfig, StoredSourceConfig } from "~/lib/library-source";
import { db } from "~/server/db";
import { library } from "~/server/db/app-schema";
import { decryptSecret } from "./crypto";
import { FsLibrarySource } from "./fs-source";
import { buildNfsMountCommand, ensureMounted, libraryMountDir, testNetworkMount, unmountPath } from "./mount";
import { S3LibrarySource, type ResolvedS3Config } from "./s3-source";
import { closeSmbSession, SmbLibrarySource, type ResolvedSmbConfig } from "./smb-source";
import type { LibrarySource } from "./types";

export type { LibrarySource, ScannedFile } from "./types";

export type LibraryDescriptor = {
  id: number;
  path: string;
  sourceType: LibrarySourceType;
  sourceConfig: StoredSourceConfig | null;
};

/** Decodes an S3 stored config, decrypting its secret key if present. */
export function resolveS3Config(stored: StoredS3Config): ResolvedS3Config {
  return {
    bucket: stored.bucket,
    region: stored.region,
    endpoint: stored.endpoint ?? null,
    prefix: stored.prefix ?? "",
    accessKeyId: stored.accessKeyId ?? null,
    secretAccessKey: stored.secretAccessKeyEnc ? decryptSecret(stored.secretAccessKeyEnc) : null,
    forcePathStyle: stored.forcePathStyle,
  };
}

/** Decodes an SMB stored config, decrypting its password if present. */
export function resolveSmbConfig(stored: StoredSmbConfig): ResolvedSmbConfig {
  return {
    host: stored.host,
    share: stored.share,
    subpath: stored.subpath ?? "",
    port: stored.port ?? null,
    username: stored.username ?? null,
    password: stored.passwordEnc ? decryptSecret(stored.passwordEnc) : null,
    domain: stored.domain ?? null,
  };
}

/** Opens the storage adapter for a library row. */
export function openLibrarySource(lib: LibraryDescriptor): LibrarySource {
  if (lib.sourceType === "s3") {
    const stored = lib.sourceConfig as StoredS3Config | null;
    if (!stored) throw new Error("S3 library is missing its bucket configuration.");
    return new S3LibrarySource(resolveS3Config(stored));
  }

  if (lib.sourceType === "smb") {
    const stored = lib.sourceConfig as StoredSmbConfig | null;
    if (!stored) throw new Error("SMB library is missing its share configuration.");
    return new SmbLibrarySource(resolveSmbConfig(stored));
  }

  if (lib.sourceType === "nfs") {
    const stored = lib.sourceConfig as StoredNfsConfig | null;
    if (!stored) throw new Error("NFS library is missing its share configuration.");
    const mountDir = libraryMountDir(env.DATA_DIR, lib.id);
    return new FsLibrarySource("nfs", lib.path, () =>
      ensureMounted(
        mountDir,
        "nfs",
        () => buildNfsMountCommand(stored, mountDir),
        stored.subpath,
      ),
    );
  }

  return new FsLibrarySource("local", lib.path, async () => lib.path);
}

/** Loads a library row by id and opens its storage source, or returns null if the library doesn't exist. */
export async function getLibrarySource(libraryId: number): Promise<LibrarySource | null> {
  const [lib] = await db
    .select({
      id: library.id,
      path: library.path,
      sourceType: library.sourceType,
      sourceConfig: library.sourceConfig,
    })
    .from(library)
    .where(eq(library.id, libraryId));
  return lib ? openLibrarySource(lib) : null;
}

/** Unmounts a managed NFS mount directory or closes a pooled SMB session. */
export async function releaseLibrarySource(lib: { id: number; sourceType: LibrarySourceType; sourceConfig: StoredSourceConfig | null }): Promise<void> {
  if (lib.sourceType === "smb" && lib.sourceConfig && "share" in lib.sourceConfig) {
    await closeSmbSession(resolveSmbConfig(lib.sourceConfig));
  }
  if (lib.sourceType === "nfs") {
    await unmountPath(libraryMountDir(env.DATA_DIR, lib.id));
  }
}

/** Tests an unsaved or updated library source without leaving behind a persistent mount. */
export async function testSourceConnection(
  source:
    | { type: "local"; path: string }
    | { type: "s3"; config: ResolvedS3Config }
    | { type: "smb"; config: ResolvedSmbConfig }
    | { type: "nfs"; config: StoredNfsConfig },
): Promise<{ detail: string }> {
  if (source.type === "local") {
    const adapter = new FsLibrarySource("local", source.path, async () => source.path);
    const res = await adapter.check();
    return { detail: res.detail ?? "Connected." };
  }
  if (source.type === "s3") {
    const adapter = new S3LibrarySource(source.config);
    const res = await adapter.check();
    return { detail: res.detail ?? "Connected." };
  }
  if (source.type === "smb") {
    const adapter = new SmbLibrarySource(source.config);
    const res = await adapter.check();
    return { detail: res.detail ?? "Connected." };
  }
  const { entries } = await testNetworkMount(
    env.DATA_DIR,
    "nfs",
    (mountPoint) => buildNfsMountCommand(source.config, mountPoint),
    source.config.subpath,
  );
  return { detail: `Connected to NFS share. Found ${entries} ${entries === 1 ? "item" : "items"} at the top level.` };
}
