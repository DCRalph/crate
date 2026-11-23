import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { parseMountOptions, type NfsVersion } from "~/lib/library-source";

const execFileAsync = promisify(execFile);

export type ResolvedSmbMountConfig = {
  host: string;
  share: string;
  subpath?: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  domain?: string | null;
};

export type ResolvedNfsMountConfig = {
  host: string;
  exportPath: string;
  subpath?: string;
  version?: NfsVersion;
  options?: string | null;
};

export type MountCommand = {
  bin: string;
  args: string[];
  /** Temporary credentials file (Linux CIFS), written with mode 0600 and removed immediately after mount. */
  credentialsFile?: { path: string; content: string };
};

/** Encodes a credential or path component for macOS `mount_smbfs` URL syntax. */
const encodeSmbPart = (value: string) => encodeURIComponent(value);

/** Strips CR/LF from a CIFS credential value so it cannot inject extra lines into the credentials file. */
const cleanCredLine = (value: string) => value.replace(/[\r\n]/g, "");

/**
 * Builds the OS command to mount an SMB/CIFS share read-only.
 * Always uses `execFile` arguments (never a shell).
 */
export function buildSmbMountCommand(
  config: ResolvedSmbMountConfig,
  mountPoint: string,
  options: { platform?: NodeJS.Platform; credFilePath?: string } = {},
): MountCommand {
  const platform = options.platform ?? process.platform;
  const host = config.host.trim();
  const share = config.share.trim();
  const port = config.port && config.port !== 445 ? config.port : null;

  if (platform === "darwin") {
    const hostPart = port ? `${host}:${port}` : host;
    const sharePart = encodeSmbPart(share);
    let authority: string;
    if (config.username) {
      const domainPart = config.domain ? `${encodeSmbPart(config.domain)};` : "";
      const userPart = encodeSmbPart(config.username);
      const passPart = config.password ? `:${encodeSmbPart(config.password)}` : "";
      authority = `${domainPart}${userPart}${passPart}@${hostPart}`;
    } else {
      authority = `guest@${hostPart}`;
    }
    return {
      bin: "/sbin/mount_smbfs",
      args: ["-N", "-o", "rdonly", `//${authority}/${sharePart}`, mountPoint],
    };
  }

  if (platform === "linux") {
    const mountOpts = ["ro", "noperm"];
    if (port) mountOpts.push(`port=${port}`);
    let credentialsFile: MountCommand["credentialsFile"];
    if (config.username) {
      const credPath = options.credFilePath ?? `${mountPoint}.cred`;
      const lines = [`username=${cleanCredLine(config.username)}`];
      lines.push(`password=${cleanCredLine(config.password ?? "")}`);
      if (config.domain) lines.push(`domain=${cleanCredLine(config.domain)}`);
      credentialsFile = { path: credPath, content: `${lines.join("\n")}\n` };
      mountOpts.push(`credentials=${credPath}`);
    } else {
      mountOpts.push("guest");
    }
    return {
      bin: "mount",
      args: ["-t", "cifs", `//${host}/${share}`, mountPoint, "-o", mountOpts.join(",")],
      credentialsFile,
    };
  }

  throw new Error(`Mounting SMB shares directly is supported on macOS and Linux (this server is ${platform}). Mount the share on the host and add it as a local folder instead.`);
}

/**
 * Builds the OS command to mount an NFS export read-only.
 * Always uses `execFile` arguments (never a shell).
 */
export function buildNfsMountCommand(
  config: ResolvedNfsMountConfig,
  mountPoint: string,
  options: { platform?: NodeJS.Platform; uid?: number } = {},
): MountCommand {
  const platform = options.platform ?? process.platform;
  const host = config.host.trim();
  const exportPath = config.exportPath.trim();
  const extra = parseMountOptions(config.options);
  if (extra === null) {
    throw new Error("NFS mount options can only contain comma-separated key or key=value entries.");
  }

  if (platform === "darwin") {
    const opts = ["ro", "soft", "intr"];
    if (config.version === "3") opts.push("vers=3");
    else if (config.version === "4") opts.push("vers=4");
    const uid = options.uid ?? process.getuid?.();
    if (uid !== undefined && uid !== 0 && !extra.some((o) => o === "resvport" || o === "noresvport")) {
      opts.push("noresvport");
    }
    opts.push(...extra);
    return {
      bin: "/sbin/mount_nfs",
      args: ["-o", opts.join(","), `${host}:${exportPath}`, mountPoint],
    };
  }

  if (platform === "linux") {
    const opts = ["ro", "soft", "nolock"];
    if (config.version === "3") opts.push("nfsvers=3");
    else if (config.version === "4") opts.push("nfsvers=4");
    opts.push(...extra);
    return {
      bin: "mount",
      args: ["-t", "nfs", `${host}:${exportPath}`, mountPoint, "-o", opts.join(",")],
    };
  }

  throw new Error(`Mounting NFS shares directly is supported on macOS and Linux (this server is ${platform}). Mount the share on the host and add it as a local folder instead.`);
}

/**
 * True when `dir` is currently an active filesystem mount point.
 * Compares POSIX device ids (`st_dev`) against the parent directory — fast,
 * zero subprocesses, and works identically on macOS and Linux.
 */
export async function isMounted(dir: string): Promise<boolean> {
  const [dirStat, parentStat] = await Promise.all([
    stat(dir).catch(() => null),
    stat(path.dirname(dir)).catch(() => null),
  ]);
  if (!dirStat?.isDirectory() || !parentStat?.isDirectory()) return false;
  return dirStat.dev !== parentStat.dev;
}

/** Translates OS mount failures into clear, actionable messages without leaking credentials. */
export function formatMountError(kind: "smb" | "nfs", error: unknown): Error {
  const err = error as { code?: string; stderr?: string; message?: string };
  const raw = `${err.stderr ?? ""} ${err.message ?? ""}`.trim();
  const lower = raw.toLowerCase();

  if (err.code === "ENOENT") {
    return new Error(
      kind === "smb"
        ? "Could not find the SMB mount tool on this server. On Linux, install `cifs-utils`."
        : "Could not find the NFS mount tool on this server. On Linux, install `nfs-common`.",
    );
  }
  if (lower.includes("authentication") || lower.includes("logon failure") || lower.includes("status_logon_failure") || lower.includes("error(13)")) {
    return new Error("The share rejected the username or password.");
  }
  if (lower.includes("operation not permitted") || lower.includes("only root") || lower.includes("must be superuser")) {
    return new Error(
      kind === "nfs"
        ? "This server does not have permission to mount NFS shares. Run with mount privileges (e.g. CAP_SYS_ADMIN), allow unprivileged ports (`insecure`) on the NFS export, or mount it on the host and add it as a local folder."
        : "This server does not have permission to mount SMB shares. On Linux, mounting CIFS requires root or CAP_SYS_ADMIN — or mount the share on the host and add it as a local folder.",
    );
  }
  if (lower.includes("permission denied") || lower.includes("access denied") || lower.includes("eacces")) {
    return new Error(
      kind === "nfs"
        ? "Access denied by the NFS server. Check the server's export rules for this host (and `insecure` if connecting from a non-root user)."
        : "Access denied by the SMB server. Check the username, password, domain, and share permissions.",
    );
  }
  if (lower.includes("no such file") || lower.includes("bad share") || lower.includes("tree connect failed") || lower.includes("not exported")) {
    return new Error(kind === "smb" ? "The share name was not found on that server." : "That export path was not found on the NFS server.");
  }
  if (lower.includes("timed out") || lower.includes("connection refused") || lower.includes("host is down") || lower.includes("no route") || lower.includes("could not resolve") || lower.includes("nodename nor servname")) {
    return new Error("Could not reach the server. Check the host name, network, and firewall.");
  }

  // Redact any embedded smb credentials if they ever appeared in stderr.
  const sanitized = raw.replace(/\/\/[^/\s]+@/g, "//***@").split("\n")[0]?.trim();
  return new Error(sanitized || `Could not mount the ${kind.toUpperCase()} share.`);
}

// Singleflight mount locks survive dev hot reloads on globalThis.
const mountState = globalThis as unknown as { crateMountLocks?: Map<string, Promise<void>> };
const mountLocks = (mountState.crateMountLocks ??= new Map());

/** Runs a mount command cleanly (writing & removing any temporary credentials file). */
export async function executeMount(kind: "smb" | "nfs", mountPoint: string, command: MountCommand): Promise<void> {
  await mkdir(mountPoint, { recursive: true });
  if (command.credentialsFile) {
    await writeFile(command.credentialsFile.path, command.credentialsFile.content, { mode: 0o600 });
  }
  try {
    await execFileAsync(command.bin, command.args, { timeout: 25_000 });
  } catch (error) {
    throw formatMountError(kind, error);
  } finally {
    if (command.credentialsFile) {
      await unlink(command.credentialsFile.path).catch(() => undefined);
    }
  }
}

/** Unmounts a managed mount directory (if mounted) and removes the empty mount directory. */
export async function unmountPath(mountPoint: string): Promise<void> {
  if (await isMounted(mountPoint)) {
    const bin = process.platform === "darwin" ? "/sbin/umount" : "umount";
    try {
      await execFileAsync(bin, [mountPoint], { timeout: 15_000 });
    } catch {
      // Fall back to lazy/force unmount if a file handle is still winding down.
      const flag = process.platform === "darwin" ? "-f" : "-l";
      await execFileAsync(bin, [flag, mountPoint], { timeout: 15_000 }).catch(() => undefined);
    }
  }
  // rmdir only deletes an empty directory, never touching files if unmount failed.
  await rmdir(mountPoint).catch(() => undefined);
}

/** Directory holding all Crate-managed network mounts. */
export function mountsRoot(dataDir: string): string {
  return path.resolve(dataDir, "mounts");
}

/** Managed mount directory for a saved library. */
export function libraryMountDir(dataDir: string, libraryId: number): string {
  return path.join(mountsRoot(dataDir), `lib-${libraryId}`);
}

/**
 * Ensures a library's SMB or NFS share is mounted at `mountPoint`, using a
 * singleflight lock so concurrent streams/scans don't race to mount it twice.
 * Returns the effective root directory (including optional `subpath`).
 */
export async function ensureMounted(
  mountPoint: string,
  kind: "smb" | "nfs",
  build: (credFilePath: string) => MountCommand,
  subpath?: string,
): Promise<string> {
  if (!(await isMounted(mountPoint))) {
    let inflight = mountLocks.get(mountPoint);
    if (!inflight) {
      inflight = (async () => {
        if (await isMounted(mountPoint)) return;
        await mkdir(path.dirname(mountPoint), { recursive: true });
        const credPath = path.join(path.dirname(mountPoint), `.cred-${randomBytes(8).toString("hex")}`);
        await executeMount(kind, mountPoint, build(credPath));
      })().finally(() => {
        mountLocks.delete(mountPoint);
      });
      mountLocks.set(mountPoint, inflight);
    }
    await inflight;
  }

  const effectiveRoot = subpath ? path.join(mountPoint, ...subpath.split("/")) : mountPoint;
  const info = await stat(effectiveRoot).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error(
      subpath
        ? `Connected to the share, but the subfolder "${subpath}" was not found.`
        : "The share mounted, but its folder could not be read.",
    );
  }
  return effectiveRoot;
}

/**
 * Tests mounting an SMB or NFS share into a temporary mount point, verifies
 * the folder (and optional subpath) is readable, and unmounts immediately.
 */
export async function testNetworkMount(
  dataDir: string,
  kind: "smb" | "nfs",
  build: (mountPoint: string, credFilePath: string) => MountCommand,
  subpath?: string,
): Promise<{ entries: number }> {
  const root = mountsRoot(dataDir);
  await mkdir(root, { recursive: true });
  const tempDir = path.join(root, `test-${randomBytes(8).toString("hex")}`);
  const credPath = path.join(root, `.cred-${randomBytes(8).toString("hex")}`);
  try {
    await executeMount(kind, tempDir, build(tempDir, credPath));
    const effective = subpath ? path.join(tempDir, ...subpath.split("/")) : tempDir;
    const info = await stat(effective).catch(() => null);
    if (!info?.isDirectory()) {
      throw new Error(
        subpath
          ? `Connected to the share, but the subfolder "${subpath}" was not found.`
          : "The share mounted, but its folder could not be read.",
      );
    }
    const { readdir } = await import("node:fs/promises");
    const entries = (await readdir(effective)).filter((name) => !name.startsWith("."));
    return { entries: entries.length };
  } finally {
    await unmountPath(tempDir);
  }
}
