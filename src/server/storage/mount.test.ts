import { describe, expect, test } from "bun:test";

import { buildNfsMountCommand, buildSmbMountCommand, formatMountError } from "./mount";

describe("buildSmbMountCommand", () => {
  test("macOS guest mount uses mount_smbfs -N -o rdonly", () => {
    const cmd = buildSmbMountCommand({ host: "nas.local", share: "My Music" }, "/data/mounts/lib-1", { platform: "darwin" });
    expect(cmd.bin).toBe("/sbin/mount_smbfs");
    expect(cmd.args).toEqual(["-N", "-o", "rdonly", "//guest@nas.local/My%20Music", "/data/mounts/lib-1"]);
    expect(cmd.credentialsFile).toBeUndefined();
  });

  test("macOS authenticated mount URL-encodes credentials and domain and supports custom port", () => {
    const cmd = buildSmbMountCommand(
      { host: "nas.local", share: "music", port: 1445, username: "alice", password: "p@ss:word/1", domain: "HOME" },
      "/data/mounts/lib-2",
      { platform: "darwin" },
    );
    expect(cmd.args).toEqual(["-N", "-o", "rdonly", "//HOME;alice:p%40ss%3Aword%2F1@nas.local:1445/music", "/data/mounts/lib-2"]);
  });

  test("Linux mount uses CIFS temp credentials file so passwords stay out of argv", () => {
    const cmd = buildSmbMountCommand(
      { host: "nas.local", share: "music", username: "alice", password: "secret\ninjected", domain: "WORKGROUP", port: 1445 },
      "/data/mounts/lib-3",
      { platform: "linux", credFilePath: "/data/mounts/.cred-test" },
    );
    expect(cmd.bin).toBe("mount");
    expect(cmd.args).toEqual([
      "-t",
      "cifs",
      "//nas.local/music",
      "/data/mounts/lib-3",
      "-o",
      "ro,noperm,port=1445,credentials=/data/mounts/.cred-test",
    ]);
    expect(cmd.credentialsFile).toEqual({
      path: "/data/mounts/.cred-test",
      content: "username=alice\npassword=secretinjected\ndomain=WORKGROUP\n",
    });
  });

  test("Linux guest mount passes guest option without a credentials file", () => {
    const cmd = buildSmbMountCommand({ host: "nas.local", share: "music" }, "/data/mounts/lib-4", { platform: "linux" });
    expect(cmd.args).toEqual(["-t", "cifs", "//nas.local/music", "/data/mounts/lib-4", "-o", "ro,noperm,guest"]);
    expect(cmd.credentialsFile).toBeUndefined();
  });
});

describe("buildNfsMountCommand", () => {
  test("macOS non-root mount includes noresvport and version flag", () => {
    const cmd = buildNfsMountCommand(
      { host: "nas.local", exportPath: "/volume1/music", version: "4", options: "timeo=50" },
      "/data/mounts/lib-5",
      { platform: "darwin", uid: 501 },
    );
    expect(cmd.bin).toBe("/sbin/mount_nfs");
    expect(cmd.args).toEqual(["-o", "ro,soft,intr,vers=4,noresvport,timeo=50", "nas.local:/volume1/music", "/data/mounts/lib-5"]);
  });

  test("macOS root mount omits noresvport", () => {
    const cmd = buildNfsMountCommand(
      { host: "nas.local", exportPath: "/export/music", version: "auto" },
      "/data/mounts/lib-6",
      { platform: "darwin", uid: 0 },
    );
    expect(cmd.args).toEqual(["-o", "ro,soft,intr", "nas.local:/export/music", "/data/mounts/lib-6"]);
  });

  test("Linux NFS mount uses nfsvers and rejects unsafe options", () => {
    const cmd = buildNfsMountCommand(
      { host: "192.168.1.50", exportPath: "/export/music", version: "3", options: "rsize=65536" },
      "/data/mounts/lib-7",
      { platform: "linux" },
    );
    expect(cmd.bin).toBe("mount");
    expect(cmd.args).toEqual([
      "-t",
      "nfs",
      "192.168.1.50:/export/music",
      "/data/mounts/lib-7",
      "-o",
      "ro,soft,nolock,nfsvers=3,rsize=65536",
    ]);

    expect(() =>
      buildNfsMountCommand({ host: "nas.local", exportPath: "/music", options: "soft;whoami" }, "/tmp/x", { platform: "linux" }),
    ).toThrow();
  });
});

describe("formatMountError", () => {
  test("maps common mount failures and redacts credentials", () => {
    expect(formatMountError("smb", { code: "ENOENT" }).message).toContain("cifs-utils");
    expect(formatMountError("nfs", { code: "ENOENT" }).message).toContain("nfs-common");
    expect(formatMountError("smb", { stderr: "mount_smbfs: server rejected the connection: Authentication error" }).message).toContain(
      "username or password",
    );
    expect(formatMountError("nfs", { stderr: "mount.nfs: Operation not permitted" }).message).toContain("permission");
    const redacted = formatMountError("smb", { stderr: "error mounting //alice:supersecret@nas.local/music" }).message;
    expect(redacted).not.toContain("supersecret");
    expect(redacted).toContain("//***@nas.local/music");
  });
});
