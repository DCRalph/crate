import { webTrackResponse } from "~/server/media/web";

/** The original file, for users whose access to the library includes downloads. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return webTrackResponse(request, (await ctx.params).id, "download");
}
