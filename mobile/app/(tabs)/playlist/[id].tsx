import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ArrowDownToLine, Check } from "lucide-react-native";
import { Alert, ScrollView } from "react-native";

import { Hero } from "@/components/hero";
import { Screen } from "@/components/screen";
import { TrackList } from "@/components/track-list";
import { Cover, Key, Note } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { progressOf, useDownloads } from "@/lib/downloads";
import { count, formatBytes, formatLength } from "@/lib/format";
import { useActiveServer } from "@/lib/servers";
import { space } from "@/lib/theme";

/**
 * One playlist: its cover, its tracks, and the key that keeps it on the
 * phone. A kept playlist is shown from the phone's own copy when the server
 * can't be reached, so it opens and plays with no connection at all.
 */
export default function PlaylistPage() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const trpc = useTRPC();
  const server = useActiveServer();
  const playlist = useQuery(trpc.playlists.byId.queryOptions({ id }));
  const shelf = useDownloads((state) => (server ? state.shelves[server.id] : undefined));
  const kept = shelf?.playlists[id];
  const progress = progressOf(shelf, id);
  const from = `playlist:${id}`;

  // What the server says, or failing that the copy on the phone.
  const data = playlist.data
    ? { name: playlist.data.name, coverKey: playlist.data.coverKey, tracks: playlist.data.tracks, duration: playlist.data.duration }
    : kept && shelf
      ? (() => {
          const tracks = kept.trackIds.flatMap((trackId) => shelf.tracks[trackId]?.track ?? []);
          return { name: kept.name, coverKey: kept.coverKey, tracks, duration: tracks.reduce((sum, track) => sum + track.duration, 0) };
        })()
      : null;

  const keepKey = !server || !data ? null : !progress ? (
    <Key icon={ArrowDownToLine} label="Keep" onPress={() => useDownloads.getState().keep(server, { id, ...data })} />
  ) : (
    <Key
      icon={progress.done === progress.total ? Check : ArrowDownToLine}
      label={progress.done === progress.total ? "Kept" : `${progress.done} of ${progress.total}`}
      onPress={() =>
        Alert.alert(`Remove ${data.name} from this phone?`, "The playlist stays on the server. Only the copy kept here goes.", [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: () => useDownloads.getState().release(server, id) },
        ])
      }
    />
  );

  return (
    <Screen back="Playlists">
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        {data ? (
          <>
            <Hero
              cover={<Cover type="playlist" id={id} size={400} version={data.coverKey} style={{ borderRadius: 3 }} />}
              title={data.name}
              facts={[count(data.tracks.length, "track"), formatLength(data.duration), progress?.bytes ? `${formatBytes(progress.bytes)} kept` : ""].filter(Boolean)}
              from={from}
              tracks={data.tracks}
            >
              {keepKey}
            </Hero>
            {progress?.failed ? <Note>{count(progress.failed, "track")} couldn&apos;t be fetched. They are tried again when the app next opens.</Note> : null}
            {data.tracks.length ? <TrackList tracks={data.tracks} showCover from={from} /> : <Note>No tracks.</Note>}
          </>
        ) : playlist.isError ? (
          <Note>{playlist.error.message}</Note>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
