import { spawn, spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { SmbAccessDeniedError, SmbAuthError, SmbConnectionError, SmbEncryptionRequiredError, SmbNotFoundError, SmbTimeoutError } from "@winlinux/smb2";

import { registerFfmpegStream } from "./ffmpeg-bridge";
import { formatSmbError } from "./smb-source";

describe("formatSmbError", () => {
  const cfg = { host: "10.99.0.24", share: "navidrome", subpath: "", port: 445 };

  test("maps SMB2/SMB3 typed errors cleanly", () => {
    expect(formatSmbError(cfg, new SmbAuthError("STATUS_LOGON_FAILURE")).message).toContain("username or password");
    expect(formatSmbError(cfg, new SmbEncryptionRequiredError("encryption required")).message).toContain("SMB3 encryption");
    expect(formatSmbError(cfg, new SmbAccessDeniedError("STATUS_ACCESS_DENIED")).message).toContain("Access denied");
    expect(formatSmbError(cfg, new SmbNotFoundError("STATUS_BAD_NETWORK_NAME")).message).toContain("not found");
    expect(formatSmbError(cfg, new SmbTimeoutError("timed out")).message).toContain("Timed out");
    expect(formatSmbError(cfg, new SmbConnectionError("ECONNREFUSED")).message).toContain("Could not connect");
  });
});

describe("registerFfmpegStream", () => {
  test("serves byte ranges on 127.0.0.1 so ffmpeg can decode and seek directly", async () => {
    const sample = spawnSync(
      "ffmpeg",
      ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    if (sample.status !== 0 || !sample.stdout?.length) return;
    const mp3 = new Uint8Array(sample.stdout);

    const url = await registerFfmpegStream({
      size: mp3.byteLength,
      contentType: "audio/mpeg",
      readRange: async (start, end) => mp3.subarray(start, end + 1),
    });
    expect(url.startsWith("http://127.0.0.1:")).toBe(true);

    // Direct HTTP Range check
    const partial = await fetch(url, { headers: { range: "bytes=0-31" } });
    expect(partial.status).toBe(206);
    expect(new Uint8Array(await partial.arrayBuffer())).toEqual(mp3.subarray(0, 32));

    // Real ffmpeg decode over the loopback Range bridge
    const { status, bytes } = await new Promise<{ status: number | null; bytes: number }>((resolve, reject) => {
      const proc = spawn("ffmpeg", ["-v", "error", "-i", url, "-f", "s16le", "-ac", "1", "-ar", "8000", "pipe:1"]);
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
});
