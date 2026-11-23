export const librarySourceTypes = ["local", "s3", "smb", "nfs"] as const;
export type LibrarySourceType = (typeof librarySourceTypes)[number];

export const nfsVersions = ["auto", "3", "4"] as const;
export type NfsVersion = (typeof nfsVersions)[number];

export const librarySourceMeta: Record<LibrarySourceType, { label: string; shortLabel: string; description: string }> = {
  local: {
    label: "Local folder",
    shortLabel: "Local",
    description: "A folder already on this server.",
  },
  s3: {
    label: "S3 bucket",
    shortLabel: "S3",
    description: "Amazon S3, Cloudflare R2, MinIO, Backblaze B2, or any S3-compatible bucket.",
  },
  smb: {
    label: "SMB share",
    shortLabel: "SMB",
    description: "A Windows, macOS, Samba, or NAS network share (SMB/CIFS).",
  },
  nfs: {
    label: "NFS share",
    shortLabel: "NFS",
    description: "An NFS export on a NAS or Linux server.",
  },
};

/** S3 settings as stored in the database. `secretAccessKeyEnc` is AES-256-GCM encrypted. */
export type StoredS3Config = {
  bucket: string;
  region: string;
  endpoint?: string | null;
  prefix?: string;
  accessKeyId?: string | null;
  secretAccessKeyEnc?: string | null;
  forcePathStyle?: boolean;
};

/** SMB settings as stored in the database. `passwordEnc` is AES-256-GCM encrypted. */
export type StoredSmbConfig = {
  host: string;
  share: string;
  subpath?: string;
  port?: number | null;
  username?: string | null;
  passwordEnc?: string | null;
  domain?: string | null;
};

/** NFS settings as stored in the database. */
export type StoredNfsConfig = {
  host: string;
  exportPath: string;
  subpath?: string;
  version?: NfsVersion;
  options?: string | null;
};

export type StoredSourceConfig = StoredS3Config | StoredSmbConfig | StoredNfsConfig;

/** S3 settings sent to the admin UI: secrets are redacted to booleans. */
export type PublicS3Config = {
  bucket: string;
  region: string;
  endpoint: string | null;
  prefix: string;
  accessKeyId: string | null;
  hasSecretAccessKey: boolean;
  forcePathStyle: boolean;
};

/** SMB settings sent to the admin UI: the password is redacted to a boolean. */
export type PublicSmbConfig = {
  host: string;
  share: string;
  subpath: string;
  port: number | null;
  username: string | null;
  hasPassword: boolean;
  domain: string | null;
};

/** NFS settings sent to the admin UI. */
export type PublicNfsConfig = {
  host: string;
  exportPath: string;
  subpath: string;
  version: NfsVersion;
  options: string | null;
};

export type PublicSourceConfig =
  | { type: "local" }
  | { type: "s3"; s3: PublicS3Config }
  | { type: "smb"; smb: PublicSmbConfig }
  | { type: "nfs"; nfs: PublicNfsConfig };

/** Strips stored secrets before sending source configuration to the browser. */
export function publicSourceConfig(sourceType: LibrarySourceType, stored: StoredSourceConfig | null | undefined): PublicSourceConfig {
  if (sourceType === "s3" && stored && "bucket" in stored) {
    return {
      type: "s3",
      s3: {
        bucket: stored.bucket,
        region: stored.region,
        endpoint: stored.endpoint ?? null,
        prefix: stored.prefix ?? "",
        accessKeyId: stored.accessKeyId ?? null,
        hasSecretAccessKey: Boolean(stored.secretAccessKeyEnc),
        forcePathStyle: Boolean(stored.forcePathStyle),
      },
    };
  }
  if (sourceType === "smb" && stored && "share" in stored) {
    return {
      type: "smb",
      smb: {
        host: stored.host,
        share: stored.share,
        subpath: stored.subpath ?? "",
        port: stored.port ?? null,
        username: stored.username ?? null,
        hasPassword: Boolean(stored.passwordEnc),
        domain: stored.domain ?? null,
      },
    };
  }
  if (sourceType === "nfs" && stored && "exportPath" in stored) {
    return {
      type: "nfs",
      nfs: {
        host: stored.host,
        exportPath: stored.exportPath,
        subpath: stored.subpath ?? "",
        version: stored.version ?? "auto",
        options: stored.options ?? null,
      },
    };
  }
  return { type: "local" };
}

/** Normalizes a relative subfolder / prefix inside a bucket or share. Returns null if it tries to climb out (`..`). */
export function normalizeSubpath(raw: string): string | null {
  const cleaned = raw.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!cleaned) return "";
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || /[\0\r\n]/.test(part))) return null;
  return parts.join("/");
}

/** Normalizes an NFS export path (must start with `/`, no `..`, no trailing slash except `/`). */
export function normalizeExportPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed.startsWith("/") || /[\0\r\n\t'"]/.test(trimmed)) return null;
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return null;
  return parts.length ? `/${parts.join("/")}` : "/";
}

/** Validates and normalizes an optional S3 endpoint URL (http or https, without trailing slash). */
export function normalizeEndpoint(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a full endpoint URL, starting with http:// or https://.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The endpoint URL must start with http:// or https://.");
  }
  // Keep origin + optional path without trailing slash.
  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

/** Validates a hostname, IPv4, or bracketed IPv6 host for SMB/NFS. */
export function isValidHost(host: string): boolean {
  const trimmed = host.trim();
  if (!trimmed || trimmed.length > 253) return false;
  if (/[\s/\\@;'"\0\r\n]/.test(trimmed)) return false;
  // Bracketed IPv6 or hostname/IPv4 (no embedded port colon).
  if (trimmed.startsWith("[")) return /^\[[0-9a-fA-F:]+\]$/.test(trimmed);
  return /^[a-zA-Z0-9._-]+$/.test(trimmed);
}

/** Validates an SMB share name (single path segment). */
export function isValidShareName(share: string): boolean {
  const trimmed = share.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.length > 255) return false;
  return !/[/\\@;'"\0\r\n]/.test(trimmed);
}

/** Validates extra comma-separated NFS mount options (e.g. `soft,timeo=50,retrans=3`). */
export function parseMountOptions(raw: string | null | undefined): string[] | null {
  const trimmed = raw?.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (!/^[a-zA-Z0-9_.-]+(=[a-zA-Z0-9_./:-]+)?$/.test(part)) return null;
  }
  return parts;
}

/**
 * The canonical unique path stored in `library.path` and displayed across the app.
 * Never includes credentials.
 */
export function canonicalSourcePath(
  source:
    | { type: "local"; path: string }
    | { type: "s3"; bucket: string; endpoint?: string | null; prefix?: string }
    | { type: "smb"; host: string; share: string; subpath?: string; port?: number | null }
    | { type: "nfs"; host: string; exportPath: string; subpath?: string },
): string {
  if (source.type === "local") return source.path;
  if (source.type === "s3") {
    const endpointHost = source.endpoint ? new URL(source.endpoint).host.toLowerCase() : null;
    const base = endpointHost ? `s3://${source.bucket}@${endpointHost}` : `s3://${source.bucket}`;
    const prefix = source.prefix ? normalizeSubpath(source.prefix) : "";
    return prefix ? `${base}/${prefix}` : base;
  }
  if (source.type === "smb") {
    const host = source.host.trim().toLowerCase();
    const port = source.port && source.port !== 445 ? `:${source.port}` : "";
    const share = source.share.trim();
    const subpath = source.subpath ? normalizeSubpath(source.subpath) : "";
    const base = `smb://${host}${port}/${share}`;
    return subpath ? `${base}/${subpath}` : base;
  }
  const host = source.host.trim().toLowerCase();
  const exportPath = normalizeExportPath(source.exportPath) ?? source.exportPath;
  const subpath = source.subpath ? normalizeSubpath(source.subpath) : "";
  const combined = subpath ? (exportPath === "/" ? `/${subpath}` : `${exportPath}/${subpath}`) : exportPath;
  return `nfs://${host}${combined}`;
}

/** True when two slash-separated relative paths are the same or one sits inside the other. */
function relPathOverlaps(a: string, b: string): boolean {
  if (!a || !b) return true;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** True when two absolute POSIX paths are the same or one sits inside the other. */
function absPathOverlaps(a: string, b: string): boolean {
  const inside = (child: string, parent: string) =>
    child === parent || (parent === "/" ? child.startsWith("/") : child.startsWith(`${parent}/`));
  return inside(a, b) || inside(b, a);
}

export type SourceIdentity = {
  sourceType: LibrarySourceType;
  path: string;
  sourceConfig: StoredSourceConfig | null;
};

/**
 * True when two libraries point at the same files (one sits inside the other).
 * A file in two libraries would have two owners, and access is per library.
 */
export function sourcesOverlap(a: SourceIdentity, b: SourceIdentity): boolean {
  if (a.sourceType !== b.sourceType) return false;
  if (a.sourceType === "local") return absPathOverlaps(a.path, b.path);

  if (a.sourceType === "s3") {
    const ca = a.sourceConfig as StoredS3Config | null;
    const cb = b.sourceConfig as StoredS3Config | null;
    if (!ca || !cb) return a.path === b.path;
    const endA = ca.endpoint ? new URL(ca.endpoint).origin.toLowerCase() : "";
    const endB = cb.endpoint ? new URL(cb.endpoint).origin.toLowerCase() : "";
    if (endA !== endB || ca.bucket !== cb.bucket) return false;
    return relPathOverlaps(ca.prefix ?? "", cb.prefix ?? "");
  }

  if (a.sourceType === "smb") {
    const ca = a.sourceConfig as StoredSmbConfig | null;
    const cb = b.sourceConfig as StoredSmbConfig | null;
    if (!ca || !cb) return a.path === b.path;
    if (
      ca.host.toLowerCase() !== cb.host.toLowerCase() ||
      (ca.port ?? 445) !== (cb.port ?? 445) ||
      ca.share.toLowerCase() !== cb.share.toLowerCase()
    ) {
      return false;
    }
    return relPathOverlaps(ca.subpath ?? "", cb.subpath ?? "");
  }

  const ca = a.sourceConfig as StoredNfsConfig | null;
  const cb = b.sourceConfig as StoredNfsConfig | null;
  if (!ca || !cb) return a.path === b.path;
  if (ca.host.toLowerCase() !== cb.host.toLowerCase()) return false;
  const fullA = ca.subpath ? (ca.exportPath === "/" ? `/${ca.subpath}` : `${ca.exportPath}/${ca.subpath}`) : ca.exportPath;
  const fullB = cb.subpath ? (cb.exportPath === "/" ? `/${cb.subpath}` : `${cb.exportPath}/${cb.subpath}`) : cb.exportPath;
  return absPathOverlaps(fullA, fullB);
}
