import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Animated } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Backdrop, Hero } from "@/components/hero";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
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
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace();

  return (
    <Screen scrollY={scrollY} title={data?.name} titleAt={90} left="back">
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: bottom, gap: space.lg }}>
        <Backdrop type="album" id={id} />
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
      </Animated.ScrollView>
    </Screen>
  );
}
