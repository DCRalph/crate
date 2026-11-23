import * as Haptics from "expo-haptics";
import type { useRouter } from "expo-router";
import { ActionSheetIOS } from "react-native";

import type { Track } from "@/lib/api";
import { usePlayer } from "@/lib/player";
import type { Server } from "@/lib/servers";

/**
 * What can be done with a track, as the system's sheet: play it next, add it
 * to the end of the queue, or put it in a playlist. A row of the queue itself
 * passes `queuePosition`, and can be taken out of it.
 */
export function showTrackMenu({ server, track, router, queuePosition }: { server: Server; track: Track; router: ReturnType<typeof useRouter>; queuePosition?: number }) {
  const { playNext, enqueue, removeAt } = usePlayer.getState();
  const actions = [
    { label: "Play next", run: () => playNext(server, [track]) },
    { label: "Add to queue", run: () => enqueue(server, [track]) },
    { label: "Add to a playlist", run: () => router.push({ pathname: "/playlist/add", params: { trackId: String(track.id) } }) },
    ...(queuePosition === undefined ? [] : [{ label: "Remove from queue", run: () => removeAt(queuePosition), destructive: true }]),
  ];
  void Haptics.selectionAsync();
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: track.title,
      message: track.artistName,
      options: [...actions.map((action) => action.label), "Cancel"],
      cancelButtonIndex: actions.length,
      destructiveButtonIndex: actions.findIndex((action) => "destructive" in action),
    },
    (chosen) => actions[chosen]?.run(),
  );
}
