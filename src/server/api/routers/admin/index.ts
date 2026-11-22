import { router } from "../../trpc";
import { folderRulesRouter } from "./folder-rules";
import { librariesRouter } from "./libraries";
import { logsRouter } from "./logs";
import { playlistsRouter } from "./playlists";
import { usersRouter } from "./users";

/** Everything under Admin. Each part checks for an admin itself, through `adminProcedure`. */
export const adminRouter = router({
  users: usersRouter,
  libraries: librariesRouter,
  folderRules: folderRulesRouter,
  playlists: playlistsRouter,
  logs: logsRouter,
});
