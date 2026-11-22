import { webTrackResponse } from "~/server/media/web";

/**
 * Audio for the web player. Signed in by session cookie, so no credentials appear in the URL.
 * With no parameters the file is sent as it is. `?q=192&f=opus` asks for a conversion (kbps,
 * and mp3, opus or aac), which the player does when the file is over its quality or the browser
 * can't play it, and `at=83` for it to start that many seconds in. See `webStreamUrl`.
 */
async function handle(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return webTrackResponse(request, (await ctx.params).id, "stream");
}

export { handle as GET, handle as HEAD };
