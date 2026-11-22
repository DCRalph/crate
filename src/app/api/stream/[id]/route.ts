import { webTrackResponse } from "~/server/media/web";

/** Audio for the web player. Signed in by session cookie, so no credentials appear in the URL. */
async function handle(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return webTrackResponse(request, (await ctx.params).id, "stream");
}

export { handle as GET, handle as HEAD };
