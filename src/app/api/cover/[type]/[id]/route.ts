import path from "node:path";
import { z } from "zod";

import { coverFile } from "~/server/library/cover";
import { CoverError, MAX_UPLOAD, uploadPlaylistCover } from "~/server/playlists/covers";
import { fileResponse } from "~/server/media/stream";
import { webScope } from "~/server/media/web";

const params = z.object({ type: z.enum(["album", "track", "artist", "playlist"]), id: z.coerce.number().int() });

/**
 * Cover art for the website: /api/cover/album/12?size=300. 404 when there is none.
 * Album art is kept by the browser for a day. A playlist's cover is generated
 * and changes when the playlist is renamed or its music does, so the browser
 * asks each time and is told when the one it has is still right.
 */
export async function GET(request: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const scope = await webScope(request);
  if (!scope) return new Response("Sign in first.", { status: 401 });
  const target = params.safeParse(await ctx.params);
  if (!target.success) return new Response("Not found.", { status: 404 });

  const query = new URL(request.url).searchParams;
  const size = Number(query.get("size")) || null;
  // `seed` asks for one particular generated playlist cover, so choices can be shown before one is picked.
  const seed = query.has("seed") ? Number(query.get("seed")) : undefined;
  const { type, id } = target.data;
  const file = await coverFile(type === "playlist" ? { type, id, seed: Number.isInteger(seed) ? seed : undefined } : { type, id }, size, scope);
  if (!file) return new Response("No cover art.", { status: 404, headers: { "Cache-Control": "private, max-age=300" } });
  if (target.data.type !== "playlist") return fileResponse(request, file, "image/jpeg", { cacheControl: "private, max-age=86400" });

  // The cached file is named after everything the cover is made from, so its name is its version.
  const etag = `"${path.basename(file, ".jpg")}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const response = await fileResponse(request, file, "image/jpeg", { cacheControl: headers["Cache-Control"] });
  response.headers.set("ETag", etag);
  return response;
}

/** Uploads a picture as a playlist's cover: POST /api/cover/playlist/12 with the image as the body. */
export async function POST(request: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const scope = await webScope(request);
  if (!scope) return new Response("Sign in first.", { status: 401 });
  const target = params.safeParse(await ctx.params);
  if (!target.success || target.data.type !== "playlist") return new Response("Not found.", { status: 404 });
  // Refused by its stated size before any of it is read.
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD) return new Response("That picture is too big. The limit is 15 MB.", { status: 413 });

  try {
    await uploadPlaylistCover(scope, target.data.id, Buffer.from(await request.arrayBuffer()));
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof CoverError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
