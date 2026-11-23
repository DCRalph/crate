import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Animated, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { TrackList } from "@/components/track-list";
import { Note, Segments } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { space } from "@/lib/theme";
import type { PlayRange } from "~/lib/most-played";

const ranges = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
] as const satisfies readonly { value: PlayRange; label: string }[];

/** The tracks this person plays most, over the last month, three months or ever, each with how often. It plays from the one touched, as the website's Most played does. */
export default function MostPlayed() {
  const trpc = useTRPC();
  const [range, setRange] = useState<PlayRange>("30d");
  const list = useQuery(trpc.library.mostPlayed.queryOptions({ range }));
  const tracks = list.data ?? [];
  const plays = Object.fromEntries(tracks.map((track) => [track.id, track.plays]));
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace();

  return (
    <Screen scrollY={scrollY} title="Most played" back>
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: bottom, gap: space.lg }}>
        <Segments name="Over" options={ranges} value={range} onChange={setRange} />
        {tracks.length ? (
          <TrackList tracks={tracks} plays={plays} showCover from={`most-played:${range}`} />
        ) : list.isPending ? null : (
          <View>
            <Note>{list.isError ? "Couldn't reach the server." : "Nothing played in this time yet."}</Note>
          </View>
        )}
      </Animated.ScrollView>
    </Screen>
  );
}
