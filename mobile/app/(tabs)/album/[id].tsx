import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";

import { Hero } from "@/components/hero";
import { Screen } from "@/components/screen";
import { TrackList } from "@/components/track-list";
import { Cover, Note } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { count, formatLength } from "@/lib/format";
import { space } from "@/lib/theme";

/** One album: its cover, what it is, and its tracks. */
export default function AlbumPage() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const trpc = useTRPC();
  const album = useQuery(trpc.library.album.queryOptions({ id }));
  const data = album.data;
  const from = `album:${id}`;

  return (
    <Screen back="Albums">
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        {data ? (
          <>
            <Hero
              cover={<Cover type="album" id={id} size={400} style={{ borderRadius: 3 }} />}
              title={data.name}
              facts={[data.artistName, data.year ? String(data.year) : "", count(data.tracks.length, "track"), formatLength(data.duration)].filter(Boolean)}
              from={from}
              tracks={data.tracks}
            />
            <TrackList tracks={data.tracks} from={from} />
          </>
        ) : album.isError ? (
          <Note>{album.error.message}</Note>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
