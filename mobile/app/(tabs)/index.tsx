import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Animated, RefreshControl, ScrollView, Text, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { AlbumTile, PlaylistTile } from "@/components/tile";
import { Card, Key, Note, SectionHeading } from "@/components/ui";
import { useTRPC, type Album } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { font, ink, ink2, label, space, usePalette } from "@/lib/theme";

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

/** A queue another of the person's devices saved since this one last played: what was on, how far in, and the keys to carry on or not. */
function CarryOn() {
  const offer = usePlayer((state) => state.offer);
  const server = useActiveServer();
  const track = offer?.tracks[offer.index];
  // An offer is from one server; it isn't made on another's Home.
  if (!offer || !track || offer.serverId !== server?.id) return null;
  return (
    <View style={{ paddingHorizontal: space.lg }}>
      <Card style={{ padding: 14, gap: 10 }}>
        <Text style={[label, { color: ink2, fontSize: 11 }]}>{offer.device ? `Carry on from ${offer.device}` : "Carry on"}</Text>
        <View>
          <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 15.5, color: ink }}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 13, color: ink2 }}>
            {`${track.artistName} · ${formatDuration(offer.position)} in · ${offer.index + 1} of ${offer.tracks.length}`}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Key tone="brand" label="Carry on" onPress={usePlayer.getState().acceptOffer} />
          <Key label="Not now" onPress={usePlayer.getState().dismissOffer} />
        </View>
      </Card>
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
    await Promise.all([home.refetch(), playlists.refetch(), usePlayer.getState().checkOffer()]);
    setRefreshing(false);
  };

  return (
    <Screen scrollY={scrollY} left="mark" settings>
      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, gap: space.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={palette.chrome2} progressViewOffset={top} />}
      >
        <CarryOn />
        {home.isError ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Note>Couldn&apos;t reach the server. What you have downloaded is under Downloads.</Note>
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
