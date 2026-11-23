import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ArrowDownToLine, Check } from "lucide-react-native";
import { Alert, Animated } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Backdrop, Hero } from "@/components/hero";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { TrackList } from "@/components/track-list";
import { Cover, Key, Note } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { progressOf, useDownloads } from "@/lib/downloads";
import { count, formatBytes, formatLength } from "@/lib/format";
import { useActiveServer } from "@/lib/servers";
import { space } from "@/lib/theme";

/**
 * One playlist: its cover, its tracks, and the key that downloads it to the
 * phone. A downloaded playlist is shown from the phone's own copy when the server
 * can't be reached, so it opens and plays with no connection at all.
 */
export default function PlaylistPage() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const trpc = useTRPC();
  const server = useActiveServer();
  const playlist = useQuery(trpc.playlists.byId.queryOptions({ id }));
  const shelf = useDownloads((state) => (server ? state.shelves[server.id] : undefined));
  const downloaded = shelf?.playlists[id];
  const held = useDownloads((state) => state.held);
  const progress = progressOf(shelf, id);
  const from = `playlist:${id}`;
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace();

  // What the server says, or failing that the copy on the phone.
  const data = playlist.data
    ? { name: playlist.data.name, coverKey: playlist.data.coverKey, tracks: playlist.data.tracks, duration: playlist.data.duration }
    : downloaded && shelf
      ? (() => {
          const tracks = downloaded.trackIds.flatMap((trackId) => shelf.tracks[trackId]?.track ?? []);
          return { name: downloaded.name, coverKey: downloaded.coverKey, tracks, duration: tracks.reduce((sum, track) => sum + track.duration, 0) };
        })()
      : null;

  const downloadKey = !server || !data ? null : !progress ? (
    <Key icon={ArrowDownToLine} label="Download" onPress={() => useDownloads.getState().download(server, { id, ...data })} />
  ) : (
    <Key
      icon={progress.done === progress.total ? Check : ArrowDownToLine}
      label={progress.done === progress.total ? "Downloaded" : `${progress.done} of ${progress.total}`}
      onPress={() =>
        Alert.alert(`Remove ${data.name} from this phone?`, "The playlist stays on the server. Only the download goes.", [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: () => useDownloads.getState().remove(server, id) },
        ])
      }
    />
  );

  return (
    <Screen scrollY={scrollY} title={data?.name} titleAt={90} left="back">
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: bottom, gap: space.lg }}>
        <Backdrop type="playlist" id={id} version={data?.coverKey} />
        {data ? (
          <>
            <Hero
              cover={<Cover type="playlist" id={id} size={400} version={data.coverKey} style={{ borderRadius: 3 }} />}
              title={data.name}
              facts={[count(data.tracks.length, "track"), formatLength(data.duration), progress?.bytes ? `${formatBytes(progress.bytes)} downloaded` : ""].filter(Boolean)}
              from={from}
              tracks={data.tracks}
            >
              {downloadKey}
            </Hero>
            {held && progress && progress.done < progress.total ? <Note>Waiting for Wi-Fi. Settings can allow mobile data.</Note> : null}
            {progress?.failed ? <Note>{count(progress.failed, "track")} couldn&apos;t be fetched. They are tried again when the app next opens.</Note> : null}
            {data.tracks.length ? <TrackList tracks={data.tracks} showCover from={from} /> : <Note>No tracks.</Note>}
          </>
        ) : playlist.isError ? (
          <Note>{playlist.error.message}</Note>
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}
