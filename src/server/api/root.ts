import { accountRouter } from "./routers/account";
import { adminRouter } from "./routers/admin";
import { infoRouter } from "./routers/info";
import { libraryRouter } from "./routers/library";
import { playlistsRouter } from "./routers/playlists";
import { router } from "./trpc";

/** The web app's API. Third-party clients use the Subsonic API in src/server/subsonic instead. */
export const appRouter = router({
  library: libraryRouter,
  playlists: playlistsRouter,
  info: infoRouter,
  account: accountRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
