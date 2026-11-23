import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Animated, RefreshControl, ScrollView, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { AlbumTile, PlaylistTile } from "@/components/tile";
import { Note, SectionHeading } from "@/components/ui";
import { useTRPC, type Album } from "@/lib/api";
import { useActiveServer } from "@/lib/servers";
import { space, usePalette } from "@/lib/theme";

const tileWidth = 148;

/** One row of tiles that scrolls sideways. */
function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <View style={{ paddingHorizontal: space.lg }}>
        <SectionHeading title={title} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.md }}>
        {children}
      </ScrollView>
    </View>
  );
}

const albums = (list: Album[]) => list.map((album) => <AlbumTile key={album.id} album={album} style={{ width: tileWidth }} />);

/** Where the app opens, under the wordmark: the playlists this person pinned, the albums they last played, what is newest, and what they play most. */
export default function Home() {
  const trpc = useTRPC();
  const palette = usePalette();
  const server = useActiveServer();
  const home = useQuery(trpc.library.home.queryOptions());
  const playlists = useQuery(trpc.playlists.tree.queryOptions());
  const pinned = (playlists.data?.playlists ?? []).filter((playlist) => playlist.pinnedAt);
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace(true);
  // Only a pull shows the spinner; the quiet refetches behind the page don't.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([home.refetch(), playlists.refetch()]);
    setRefreshing(false);
  };

  return (
    <Screen scrollY={scrollY} left="mark" settings>
      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={{ paddingTop: top + space.md, paddingBottom: bottom, gap: space.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.chrome2} progressViewOffset={top} />}
      >
        {home.isError ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Note>Couldn&apos;t reach the server. What you have kept is under Kept.</Note>
          </View>
        ) : null}
        {pinned.length ? (
          <Row title="Pinned">
            {pinned.map((playlist) => (
              <PlaylistTile key={playlist.id} playlist={playlist} style={{ width: tileWidth }} />
            ))}
          </Row>
        ) : null}
        {home.data?.recent.length ? <Row title="Jump back in">{albums(home.data.recent)}</Row> : null}
        {home.data?.added.length ? <Row title="Recently added">{albums(home.data.added)}</Row> : null}
        {home.data?.frequent.length ? <Row title="Most played">{albums(home.data.frequent)}</Row> : null}
        {home.data && !home.data.added.length ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Note>{server?.user.isAdmin ? "The crate is empty. Add a library on the server and it fills itself." : "The crate is empty. Ask whoever runs this server for a library."}</Note>
          </View>
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}
