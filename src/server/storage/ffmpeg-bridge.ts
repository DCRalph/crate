import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { parseRange } from "~/server/media/range";

const CHUNK_SIZE = 256 * 1024;
const DEFAULT_TTL_MS = 60 * 60_000;

export type BridgeSource = {
  size: number;
  contentType: string;
  readRange: (start: number, end: number, signal?: AbortSignal) => Promise<Uint8Array>;
};

type Entry = BridgeSource & { expiresAt: number };

const state = globalThis as unknown as {
  crateFfmpegBridge?: { server: Server; port: number; entries: Map<string, Entry> };
  crateFfmpegBridgeStarting?: Promise<{ server: Server; port: number; entries: Map<string, Entry> }>;
};

function prune(entries: Map<string, Entry>) {
  const now = Date.now();
  for (const [token, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(token);
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, entries: Map<string, Entry>) {
  prune(entries);
  const token = (req.url ?? "").replace(/^\/+/, "").split("?")[0] ?? "";
  const entry = entries.get(token);
  if (!entry || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(404);
    res.end();
    return;
  }

  const range = parseRange(typeof req.headers.range === "string" ? req.headers.range : null, entry.size);
  if (range === "unsatisfiable") {
    res.writeHead(416, { "Content-Range": `bytes */${entry.size}` });
    res.end();
    return;
  }

  const { start, end } = range === "all" ? { start: 0, end: entry.size - 1 } : range;
  const length = entry.size === 0 ? 0 : end - start + 1;
  const headers: Record<string, string> = {
    "Content-Type": entry.contentType,
    "Accept-Ranges": "bytes",
    "Content-Length": String(length),
  };
  if (range !== "all") headers["Content-Range"] = `bytes ${start}-${end}/${entry.size}`;
  res.writeHead(range === "all" ? 200 : 206, headers);

  if (req.method === "HEAD" || length === 0) {
    res.end();
    return;
  }

  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    let offset = start;
    while (offset <= end && !abort.signal.aborted) {
      const chunkEnd = Math.min(end, offset + CHUNK_SIZE - 1);
      const data = await entry.readRange(offset, chunkEnd, abort.signal);
      if (!data.byteLength || abort.signal.aborted) break;
      offset += data.byteLength;
      if (!res.write(data)) {
        await new Promise<void>((resolve) => res.once("drain", resolve));
      }
    }
    if (!res.writableEnded) res.end();
  } catch {
    if (!res.writableEnded) res.destroy();
  }
}

async function ensureBridge() {
  if (state.crateFfmpegBridge) return state.crateFfmpegBridge;
  if (!state.crateFfmpegBridgeStarting) {
    state.crateFfmpegBridgeStarting = new Promise((resolve, reject) => {
      const entries = new Map<string, Entry>();
      const server = createServer((req, res) => {
        void handleRequest(req, res, entries);
      });
      server.on("error", reject);
      // Bound strictly to loopback so only local ffmpeg processes can reach it.
      server.listen(0, "127.0.0.1", () => {
        server.unref();
        const port = (server.address() as AddressInfo).port;
        const bridge = { server, port, entries };
        state.crateFfmpegBridge = bridge;
        resolve(bridge);
      });
    });
  }
  return state.crateFfmpegBridgeStarting;
}

/**
 * Exposes a range-readable remote file on a localhost-only URL with an
 * unguessable short-lived token so `ffmpeg` can seek cleanly (including `-ss`
 * and M4A/FLAC random access) without writing temp files or needing OS mounts.
 */
export async function registerFfmpegStream(source: BridgeSource, ttlMs = DEFAULT_TTL_MS): Promise<string> {
  const bridge = await ensureBridge();
  prune(bridge.entries);
  const token = randomBytes(24).toString("hex");
  bridge.entries.set(token, { ...source, expiresAt: Date.now() + ttlMs });
  return `http://127.0.0.1:${bridge.port}/${token}`;
}
