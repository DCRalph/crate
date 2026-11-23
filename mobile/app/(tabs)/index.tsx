import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Animated, RefreshControl, ScrollView, Text, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { AlbumTile, PlaylistTile, rowLetters } from "@/components/tile";
import { Card, Key, Note, SectionHeading } from "@/components/ui";
import { useTRPC, type Album } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { deck, font, ink, ink2, label, space } from "@/lib/theme";

const tileWidth = 140;

/** One lettered row of tiles that scrolls sideways. Room is left round it for the light the tiles throw, which the row would otherwise cut off. */
function Row({ title, letter, onMore, children }: { title: string; letter: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <View>
      {/* Over the row, which reaches up behind it, so See all still takes a touch. */}
      <View style={{ paddingHorizontal: space.lg, zIndex: 1 }}>
        <SectionHeading title={title} letter={letter} onMore={onMore} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: -24 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: 24, paddingBottom: 30, gap: space.md }}>
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

const albums = (list: Album[], letter: string) => list.map((album, index) => <AlbumTile key={album.id} album={album} code={`${letter}${index + 1}`} style={{ width: tileWidth }} />);

/**
 * Where the app opens: the playlists this person pinned, the albums they last
 * played, what is newest, and what they play most, each a row lettered in
 * turn (A, B, C) with its tiles coded "B3", as on the website.
 */
export default function Home() {
  const trpc = useTRPC();
  const router = useRouter();
  const server = useActiveServer();
  const home = useQuery(trpc.library.home.queryOptions());
  const playlists = useQuery(trpc.playlists.tree.queryOptions());
  const pinned = (playlists.data?.playlists ?? []).filter((playlist) => playlist.pinnedAt);
  const data = home.data;
  const rows = [
    pinned.length ? { key: "pinned", title: "Pinned", tiles: (letter: string) => pinned.map((playlist, index) => <PlaylistTile key={playlist.id} playlist={playlist} code={`${letter}${index + 1}`} style={{ width: tileWidth }} />) } : null,
    data?.recent.length ? { key: "recent", title: "Jump back in", tiles: (letter: string) => albums(data.recent, letter) } : null,
    data?.added.length ? { key: "added", title: "Recently added", onMore: () => router.navigate("/albums"), tiles: (letter: string) => albums(data.added, letter) } : null,
    data?.frequent.length ? { key: "frequent", title: "Most played", onMore: () => router.push("/most-played"), tiles: (letter: string) => albums(data.frequent, letter) } : null,
  ].filter((row) => row !== null);
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
    <Screen scrollY={scrollY} title="Home" search settings>
      <Animated.ScrollView
        {...scrollProps}
        contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, gap: space.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={deck.chrome2} progressViewOffset={top} />}
      >
        <CarryOn />
        {home.isError ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Note>Couldn&apos;t reach the server. What you have downloaded is under Downloads.</Note>
          </View>
        ) : null}
        {rows.map((row, index) => {
          const letter = rowLetters[index] ?? "";
          return (
            <Row key={row.key} title={row.title} letter={letter} onMore={row.onMore}>
              {row.tiles(letter)}
            </Row>
          );
        })}
        {home.data && !home.data.added.length ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Note>{server?.user.isAdmin ? "The crate is empty. Add a library on the server and it fills itself." : "The crate is empty. Ask whoever runs this server for a library."}</Note>
          </View>
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}
