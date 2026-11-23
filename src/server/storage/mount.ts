import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { parseMountOptions, type NfsVersion } from "~/lib/library-source";

const execFileAsync = promisify(execFile);
const MOUNT_TIMEOUT_MS = 25_000;

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

/** Removes any embedded SMB credentials from text before logging or returning to the UI. */
export function redactMountText(text: string): string {
  return text.replace(/\/\/[^/\s]+@/g, "//***@").replace(/(password=)[^\s,]+/gi, "$1***");
}

function redactArgs(args: string[]): string[] {
  return args.map(redactMountText);
}

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

  throw new Error(
    `Mounting SMB shares directly is supported on macOS and Linux (this server is ${platform}). Mount the share on the host and add it as a local folder instead.`,
  );
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

  throw new Error(
    `Mounting NFS shares directly is supported on macOS and Linux (this server is ${platform}). Mount the share on the host and add it as a local folder instead.`,
  );
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

type ExecError = {
  code?: string | number;
  errno?: number;
  killed?: boolean;
  signal?: string | null;
  stderr?: string;
  stdout?: string;
  message?: string;
};

/** Pulls the most informative non-empty line from stderr/stdout with credentials redacted. */
function extractStderrDetail(err: ExecError): string | null {
  const text = `${err.stderr ?? ""}\n${err.stdout ?? ""}`.trim();
  if (!text) return null;
  const lines = redactMountText(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  // Join up to two short lines so multi-line mount.nfs diagnostics stay readable.
  return lines.slice(0, 2).join(" — ");
}

function withDetail(summary: string, detail: string | null): Error {
  return new Error(detail ? `${summary} (${detail})` : summary);
}

/** Translates OS mount failures into clear, actionable messages while preserving sanitized diagnostic detail. */
export function formatMountError(kind: "smb" | "nfs", error: unknown): Error {
  const err = error as ExecError;
  const detail = extractStderrDetail(err);
  const raw = `${err.stderr ?? ""} ${err.stdout ?? ""} ${err.message ?? ""}`.trim();
  const lower = raw.toLowerCase();

  if (err.killed || lower.includes("timed out") || lower.includes("etimedout")) {
    return withDetail(
      kind === "nfs"
        ? "Timed out connecting to the NFS server. Check that the host is reachable, NFS is running, and port 2049 (and 111 for NFSv3) is open."
        : "Timed out connecting to the SMB server. Check that the host is reachable and port 445 is open.",
      detail,
    );
  }
  if (
    err.code === "ENOENT" ||
    lower.includes("helper program") ||
    lower.includes("unknown filesystem type") ||
    lower.includes("wrong fs type") ||
    lower.includes("mount.nfs: not found") ||
    lower.includes("mount.cifs: not found")
  ) {
    return withDetail(
      kind === "smb"
        ? "SMB mount support is missing on this server. On Debian/Ubuntu, install `cifs-utils`."
        : "NFS mount support is missing on this server. On Debian/Ubuntu, install `nfs-common`.",
      detail,
    );
  }
  if (lower.includes("authentication") || lower.includes("logon failure") || lower.includes("status_logon_failure") || lower.includes("error(13)")) {
    return withDetail("The share rejected the username or password.", detail);
  }
  if (
    lower.includes("operation not permitted") ||
    lower.includes("only root") ||
    lower.includes("must be superuser") ||
    lower.includes("eperm") ||
    lower.includes("failed mount system call") ||
    /mount:\s+[^:\n]+:\s+permission denied/.test(lower)
  ) {
    return withDetail(
      kind === "nfs"
        ? "This server does not have permission to run kernel mounts (mount(2) rejected). In Docker/Dokploy, add CAP_SYS_ADMIN (or mount the NFS share on the host and bind-mount it as a local folder); on macOS, export with `insecure` or run with mount privileges."
        : "This server does not have permission to run kernel mounts (mount(2) rejected). On Linux/Docker, mounting CIFS requires root or CAP_SYS_ADMIN (or mount the share on the host and bind-mount it as a local folder).",
      detail,
    );
  }
  if (
    lower.includes("protocol not supported") ||
    lower.includes("version or transport protocol") ||
    lower.includes("program/version mismatch") ||
    lower.includes("rpc_progversmismatch")
  ) {
    return withDetail(
      kind === "nfs"
        ? "The NFS server rejected the requested NFS version or protocol. Try switching NFS version between Auto, NFSv4, and NFSv3."
        : "The SMB server rejected the protocol version or mount options.",
      detail,
    );
  }
  if (
    kind === "nfs" &&
    (lower.includes("program not registered") || lower.includes("portmap") || lower.includes("rpcbind") || lower.includes("rpc:"))
  ) {
    return withDetail(
      "The NFS RPC service isn't reachable on that host. Check that NFS is running and ports 2049 / 111 are open (or try NFSv4).",
      detail,
    );
  }
  if (lower.includes("permission denied") || lower.includes("access denied") || lower.includes("eacces")) {
    return withDetail(
      kind === "nfs"
        ? "Access denied by the NFS server. Check the export allowlist for this client's IP (and `insecure` if connecting from a non-root port)."
        : "Access denied by the SMB server. Check the username, password, domain, and share permissions.",
      detail,
    );
  }
  if (lower.includes("no such file") || lower.includes("bad share") || lower.includes("tree connect failed") || lower.includes("not exported")) {
    return withDetail(
      kind === "smb"
        ? "The share name was not found on that server."
        : "That export path was not found on the NFS server. Check the export path (NFSv4 often exports relative to its pseudo-root, e.g. `/music` instead of `/export/music`).",
      detail,
    );
  }
  if (lower.includes("connection refused") || lower.includes("econnrefused")) {
    return withDetail(
      kind === "nfs"
        ? "Connection refused by the NFS server. Check that NFS is running and port 2049 is open."
        : "Connection refused by the SMB server. Check that SMB is running and port 445 is open.",
      detail,
    );
  }
  if (
    lower.includes("could not resolve") ||
    lower.includes("nodename nor servname") ||
    lower.includes("name or service not known") ||
    lower.includes("temporary failure in name resolution") ||
    lower.includes("failed to resolve")
  ) {
    return withDetail("Could not resolve that host name. Check the host name or use an IP address.", detail);
  }
  if (lower.includes("host is down") || lower.includes("no route") || lower.includes("network is unreachable")) {
    return withDetail("Could not reach the server on the network. Check the host, VPN, and firewall.", detail);
  }
  if (lower.includes("stale file handle") || lower.includes("estale")) {
    return withDetail("The share has a stale file handle. Try reconnecting the share.", detail);
  }

  const sanitized = detail ?? redactMountText(raw).split("\n")[0]?.trim();
  return new Error(sanitized || `Could not mount the ${kind.toUpperCase()} share.`);
}

/** Verifies a mounted directory (and optional subpath) is readable, translating POSIX errors with clear NFS/SMB hints. */
async function verifyMountedDirectory(kind: "smb" | "nfs", mountPoint: string, subpath?: string): Promise<{ effective: string; entries: string[] }> {
  const effective = subpath ? path.join(mountPoint, ...subpath.split("/")) : mountPoint;
  let info;
  try {
    info = await stat(effective);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    console.error(`[storage:${kind}] stat failed after mount`, {
      mountPoint,
      subpath: subpath ?? "",
      code,
      message: error instanceof Error ? error.message : String(error),
    });
    if (code === "ENOENT") {
      throw new Error(
        subpath
          ? `Connected to the ${kind.toUpperCase()} share, but the subfolder "${subpath}" was not found.`
          : `The ${kind.toUpperCase()} share mounted, but its root directory was not found.`,
      );
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new Error(
        kind === "nfs"
          ? `Mounted the NFS export, but this server (uid ${process.getuid?.() ?? "?"}) lacks permission to read ${subpath ? `"${subpath}"` : "the exported directory"}. Check directory permissions and NFS squash/anonuid settings.`
          : `Mounted the SMB share, but permission was denied reading ${subpath ? `"${subpath}"` : "the share root"}.`,
      );
    }
    if (code === "ESTALE" || code === "EIO") {
      throw new Error(`The ${kind.toUpperCase()} mount returned ${code}. Try reconnecting the share.`);
    }
    throw new Error(
      `The ${kind.toUpperCase()} share mounted, but reading ${subpath ? `"${subpath}"` : "its folder"} failed (${code ?? "unknown error"}).`,
    );
  }

  if (!info.isDirectory()) {
    throw new Error(subpath ? `"${subpath}" inside the share is a file, not a folder.` : "The mounted share target is not a folder.");
  }

  try {
    const entries = await readdir(effective);
    return { effective, entries };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    console.error(`[storage:${kind}] readdir failed after mount`, {
      mountPoint,
      subpath: subpath ?? "",
      code,
      message: error instanceof Error ? error.message : String(error),
    });
    if (code === "EACCES" || code === "EPERM") {
      throw new Error(
        kind === "nfs"
          ? `Mounted the NFS export, but this server (uid ${process.getuid?.() ?? "?"}) lacks permission to list ${subpath ? `"${subpath}"` : "the exported directory"}. Check directory permissions and NFS squash/anonuid settings.`
          : `Mounted the SMB share, but permission was denied listing ${subpath ? `"${subpath}"` : "the share root"}.`,
      );
    }
    throw new Error(
      `Mounted the ${kind.toUpperCase()} share, but listing its files failed (${code ?? (error instanceof Error ? error.message : "unknown error")}).`,
    );
  }
}

// Singleflight mount locks survive dev hot reloads on globalThis.
const mountState = globalThis as unknown as { crateMountLocks?: Map<string, Promise<void>> };
const mountLocks = (mountState.crateMountLocks ??= new Map());

/** Runs a mount command cleanly (writing & removing any temporary credentials file) and logs failures with diagnostics. */
export async function executeMount(kind: "smb" | "nfs", mountPoint: string, command: MountCommand): Promise<void> {
  await mkdir(mountPoint, { recursive: true });
  if (command.credentialsFile) {
    await writeFile(command.credentialsFile.path, command.credentialsFile.content, { mode: 0o600 });
  }
  const safeArgs = redactArgs(command.args);
  try {
    await execFileAsync(command.bin, command.args, { timeout: MOUNT_TIMEOUT_MS });
  } catch (error) {
    const err = error as ExecError;
    console.error(`[storage:${kind}] mount failed`, {
      platform: process.platform,
      uid: process.getuid?.(),
      command: `${command.bin} ${safeArgs.join(" ")}`,
      code: err.code ?? null,
      signal: err.signal ?? null,
      killed: Boolean(err.killed),
      stderr: err.stderr ? redactMountText(err.stderr.trim()) : "",
      stdout: err.stdout ? redactMountText(err.stdout.trim()) : "",
    });
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
    } catch (error) {
      // Fall back to lazy/force unmount if a file handle is still winding down.
      const flag = process.platform === "darwin" ? "-f" : "-l";
      await execFileAsync(bin, [flag, mountPoint], { timeout: 15_000 }).catch((fallbackError: unknown) => {
        console.warn(`[storage:mount] unmount failed for ${mountPoint}`, {
          firstError: error instanceof Error ? error.message : String(error),
          fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        });
      });
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

  const { effective } = await verifyMountedDirectory(kind, mountPoint, subpath);
  return effective;
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
    const { entries } = await verifyMountedDirectory(kind, tempDir, subpath);
    return { entries: entries.filter((name) => !name.startsWith(".")).length };
  } finally {
    await unmountPath(tempDir);
  }
}
