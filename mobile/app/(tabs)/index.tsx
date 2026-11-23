import { useQuery } from "@tanstack/react-query";
import { RefreshControl, ScrollView, View } from "react-native";

import { Screen } from "@/components/screen";
import { AlbumTile, PlaylistTile } from "@/components/tile";
import { Note, SectionHeading, Title } from "@/components/ui";
import { useTRPC, type Album } from "@/lib/api";
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

/** Where the app opens: the playlists this person pinned, the albums they last played, what is newest, and what they play most. */
export default function Home() {
  const trpc = useTRPC();
  const palette = usePalette();
  const home = useQuery(trpc.library.home.queryOptions());
  const playlists = useQuery(trpc.playlists.tree.queryOptions());
  const pinned = (playlists.data?.playlists ?? []).filter((playlist) => playlist.pinnedAt);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingVertical: space.lg, gap: space.xl }}
        refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => void Promise.all([home.refetch(), playlists.refetch()])} tintColor={palette.chrome2} />}
      >
        <Title style={{ paddingHorizontal: space.lg }}>Home</Title>
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
            <Note>The crate is empty. Add a library on the server and it fills itself.</Note>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
