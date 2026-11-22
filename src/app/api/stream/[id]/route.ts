import { webTrackResponse } from "~/server/media/web";

/**
 * Audio for the web player. Signed in by session cookie, so no credentials appear in the URL.
 * `?q=192&f=opus` asks for a conversion (kbps, and mp3, opus or aac), and `at=83` for it to
 * start that many seconds in. See `webStreamUrl`.
 */
async function handle(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return webTrackResponse(request, (await ctx.params).id, "stream");
}

export { handle as GET, handle as HEAD };
