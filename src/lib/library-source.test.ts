import { describe, expect, test } from "bun:test";

import {
  canonicalSourcePath,
  isValidHost,
  isValidShareName,
  normalizeEndpoint,
  normalizeExportPath,
  normalizeSubpath,
  parseMountOptions,
  publicSourceConfig,
  sourcesOverlap,
  type SourceIdentity,
} from "./library-source";

describe("normalization & validation", () => {
  test("normalizeSubpath trims slashes, normalizes backslashes, and rejects traversal", () => {
    expect(normalizeSubpath("")).toBe("");
    expect(normalizeSubpath("  /music/flac/  ")).toBe("music/flac");
    expect(normalizeSubpath("a\\b\\c")).toBe("a/b/c");
    expect(normalizeSubpath("a/../b")).toBeNull();
    expect(normalizeSubpath(".")).toBeNull();
  });

  test("normalizeExportPath requires a leading slash and rejects traversal or quotes", () => {
    expect(normalizeExportPath("/")).toBe("/");
    expect(normalizeExportPath("/volume1/music/")).toBe("/volume1/music");
    expect(normalizeExportPath("volume1/music")).toBeNull();
    expect(normalizeExportPath("/volume1/../etc")).toBeNull();
    expect(normalizeExportPath("/vol'ume1")).toBeNull();
  });

  test("normalizeEndpoint validates http(s) URLs and trims trailing slashes", () => {
    expect(normalizeEndpoint("")).toBeNull();
    expect(normalizeEndpoint(undefined)).toBeNull();
    expect(normalizeEndpoint("https://r2.example.com/")).toBe("https://r2.example.com");
    expect(normalizeEndpoint("http://192.168.1.10:9000/s3/")).toBe("http://192.168.1.10:9000/s3");
    expect(() => normalizeEndpoint("ftp://files.example.com")).toThrow();
    expect(() => normalizeEndpoint("not-a-url")).toThrow();
  });

  test("isValidHost and isValidShareName reject unsafe characters", () => {
    expect(isValidHost("nas.local")).toBe(true);
    expect(isValidHost("192.168.1.50")).toBe(true);
    expect(isValidHost("[fe80::1]")).toBe(true);
    expect(isValidHost("nas.local/share")).toBe(false);
    expect(isValidHost("user@nas.local")).toBe(false);
    expect(isValidHost("nas.local;rm -rf")).toBe(false);

    expect(isValidShareName("music")).toBe(true);
    expect(isValidShareName("My Music")).toBe(true);
    expect(isValidShareName("a/b")).toBe(false);
    expect(isValidShareName("..")).toBe(false);
  });

  test("parseMountOptions allows safe comma-separated options and rejects shell/quote characters", () => {
    expect(parseMountOptions("")).toEqual([]);
    expect(parseMountOptions("soft, timeo=50, retrans=3")).toEqual(["soft", "timeo=50", "retrans=3"]);
    expect(parseMountOptions("soft;id")).toBeNull();
    expect(parseMountOptions("soft,bad option")).toBeNull();
  });
});

describe("canonicalSourcePath", () => {
  test("formats local, S3, SMB, and NFS canonical paths without credentials", () => {
    expect(canonicalSourcePath({ type: "local", path: "/music/main" })).toBe("/music/main");
    expect(canonicalSourcePath({ type: "s3", bucket: "my-music" })).toBe("s3://my-music");
    expect(canonicalSourcePath({ type: "s3", bucket: "my-music", prefix: "/flac/" })).toBe("s3://my-music/flac");
    expect(
      canonicalSourcePath({ type: "s3", bucket: "my-music", endpoint: "http://MinIO.Local:9000", prefix: "lossless" }),
    ).toBe("s3://my-music@minio.local:9000/lossless");

    expect(canonicalSourcePath({ type: "smb", host: "NAS.local", share: "music" })).toBe("smb://nas.local/music");
    expect(canonicalSourcePath({ type: "smb", host: "nas.local", share: "music", port: 445 })).toBe("smb://nas.local/music");
    expect(canonicalSourcePath({ type: "smb", host: "nas.local", share: "music", port: 1445, subpath: "DJ/Sets" })).toBe(
      "smb://nas.local:1445/music/DJ/Sets",
    );

    expect(canonicalSourcePath({ type: "nfs", host: "NAS.local", exportPath: "/export/music" })).toBe("nfs://nas.local/export/music");
    expect(canonicalSourcePath({ type: "nfs", host: "nas.local", exportPath: "/export/music", subpath: "jazz" })).toBe(
      "nfs://nas.local/export/music/jazz",
    );
    expect(canonicalSourcePath({ type: "nfs", host: "nas.local", exportPath: "/", subpath: "music" })).toBe("nfs://nas.local/music");
  });
});

describe("sourcesOverlap", () => {
  test("detects overlapping local folders and ignores siblings", () => {
    const a: SourceIdentity = { sourceType: "local", path: "/music", sourceConfig: null };
    const b: SourceIdentity = { sourceType: "local", path: "/music/flac", sourceConfig: null };
    const c: SourceIdentity = { sourceType: "local", path: "/music2", sourceConfig: null };
    expect(sourcesOverlap(a, b)).toBe(true);
    expect(sourcesOverlap(b, a)).toBe(true);
    expect(sourcesOverlap(a, c)).toBe(false);
  });

  test("detects overlapping S3 prefixes only on the same endpoint and bucket", () => {
    const awsRoot: SourceIdentity = {
      sourceType: "s3",
      path: "s3://music",
      sourceConfig: { bucket: "music", region: "us-east-1", endpoint: null, prefix: "" },
    };
    const awsSub: SourceIdentity = {
      sourceType: "s3",
      path: "s3://music/flac",
      sourceConfig: { bucket: "music", region: "us-east-1", endpoint: null, prefix: "flac" },
    };
    const awsOtherSub: SourceIdentity = {
      sourceType: "s3",
      path: "s3://music/mp3",
      sourceConfig: { bucket: "music", region: "us-east-1", endpoint: null, prefix: "mp3" },
    };
    const minioSameBucket: SourceIdentity = {
      sourceType: "s3",
      path: "s3://music@minio.local:9000",
      sourceConfig: { bucket: "music", region: "us-east-1", endpoint: "http://minio.local:9000", prefix: "" },
    };

    expect(sourcesOverlap(awsRoot, awsSub)).toBe(true);
    expect(sourcesOverlap(awsSub, awsOtherSub)).toBe(false);
    expect(sourcesOverlap(awsRoot, minioSameBucket)).toBe(false);
  });

  test("detects overlapping SMB shares case-insensitively on host and share", () => {
    const a: SourceIdentity = {
      sourceType: "smb",
      path: "smb://nas.local/music/rock",
      sourceConfig: { host: "NAS.local", share: "Music", subpath: "rock", port: null },
    };
    const b: SourceIdentity = {
      sourceType: "smb",
      path: "smb://nas.local/music/rock/90s",
      sourceConfig: { host: "nas.local", share: "music", subpath: "rock/90s", port: 445 },
    };
    const c: SourceIdentity = {
      sourceType: "smb",
      path: "smb://nas.local/music/jazz",
      sourceConfig: { host: "nas.local", share: "music", subpath: "jazz", port: null },
    };
    expect(sourcesOverlap(a, b)).toBe(true);
    expect(sourcesOverlap(a, c)).toBe(false);
  });

  test("detects overlapping NFS exports and subpaths", () => {
    const a: SourceIdentity = {
      sourceType: "nfs",
      path: "nfs://nas.local/export/music",
      sourceConfig: { host: "nas.local", exportPath: "/export/music", subpath: "" },
    };
    const b: SourceIdentity = {
      sourceType: "nfs",
      path: "nfs://nas.local/export/music/flac",
      sourceConfig: { host: "NAS.LOCAL", exportPath: "/export", subpath: "music/flac" },
    };
    const c: SourceIdentity = {
      sourceType: "nfs",
      path: "nfs://nas.local/export/videos",
      sourceConfig: { host: "nas.local", exportPath: "/export/videos", subpath: "" },
    };
    expect(sourcesOverlap(a, b)).toBe(true);
    expect(sourcesOverlap(a, c)).toBe(false);
  });
});

describe("publicSourceConfig", () => {
  test("never exposes encrypted secrets and sets presence booleans instead", () => {
    const s3 = publicSourceConfig("s3", {
      bucket: "music",
      region: "auto",
      endpoint: "https://r2.example.com",
      prefix: "flac",
      accessKeyId: "AKIA123",
      secretAccessKeyEnc: "secret-ciphertext",
      forcePathStyle: true,
    });
    expect(s3).toEqual({
      type: "s3",
      s3: {
        bucket: "music",
        region: "auto",
        endpoint: "https://r2.example.com",
        prefix: "flac",
        accessKeyId: "AKIA123",
        hasSecretAccessKey: true,
        forcePathStyle: true,
      },
    });
    expect(JSON.stringify(s3)).not.toContain("secret-ciphertext");

    const smb = publicSourceConfig("smb", {
      host: "nas.local",
      share: "music",
      username: "alice",
      passwordEnc: "pw-ciphertext",
      domain: "HOME",
    });
    expect(smb).toEqual({
      type: "smb",
      smb: {
        host: "nas.local",
        share: "music",
        subpath: "",
        port: null,
        username: "alice",
        hasPassword: true,
        domain: "HOME",
      },
    });
    expect(JSON.stringify(smb)).not.toContain("pw-ciphertext");
  });
});
