import { handleSubsonic } from "~/server/subsonic/handle";

// The Subsonic API for third-party clients. See src/server/subsonic.
async function handle(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return handleSubsonic(request, (await ctx.params).path);
}

export { handle as GET, handle as POST, handle as HEAD };
