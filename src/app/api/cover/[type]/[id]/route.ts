import { z } from "zod";

import { coverFile } from "~/server/library/cover";
import { fileResponse } from "~/server/media/stream";
import { webScope } from "~/server/media/web";

const params = z.object({ type: z.enum(["album", "track", "artist", "playlist"]), id: z.coerce.number().int() });

/** Cover art for the website: /api/cover/album/12?size=300. 404 when there is none. */
export async function GET(request: Request, ctx: { params: Promise<{ type: string; id: string }> }) {
  const scope = await webScope(request);
  if (!scope) return new Response("Sign in first.", { status: 401 });
  const target = params.safeParse(await ctx.params);
  if (!target.success) return new Response("Not found.", { status: 404 });

  const size = Number(new URL(request.url).searchParams.get("size")) || null;
  const file = await coverFile(target.data, size, scope);
  if (!file) return new Response("No cover art.", { status: 404, headers: { "Cache-Control": "private, max-age=300" } });
  return fileResponse(request, file, "image/jpeg", { cacheControl: "private, max-age=86400" });
}
