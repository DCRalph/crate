import { z } from "zod";

import { readPlayQueue, savePlayQueue } from "~/server/library/play-queue";
import { protectedProcedure, router } from "../trpc";
import { toWebTrack } from "./library";

const id = z.number().int();

/** The play queue a person carries between their devices. Subsonic clients share it through `getPlayQueue` and `savePlayQueue`. */
export const queueRouter = router({
  /** The queue last saved from any of this person's devices: its tracks, the one that was playing, how far in, and which device saved it when. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const saved = await readPlayQueue(ctx.scope);
    return saved && { ...saved, tracks: saved.tracks.map((row) => toWebTrack(ctx.scope, row)) };
  }),

  /** Saves the queue as it is now on the device asking, and says when the server took it: a device that sees a later time on `get` knows another has saved since. */
  save: protectedProcedure
    .input(z.object({ trackIds: z.array(id).max(5000), currentId: id.nullable(), positionMs: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => ({ changedAt: await savePlayQueue(ctx.scope, input, ctx.caller.client) })),
});
