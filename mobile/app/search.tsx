import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react-native";
import { Animated, ScrollView, TextInput, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { AlbumTile } from "@/components/tile";
import { TrackList } from "@/components/track-list";
import { Inset, Note, SectionHeading } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { deck, font, space } from "@/lib/theme";

/** How long typing has to stop for before the server is asked. */
const settle = 250;

/**
 * Search: a field in a window of glass, and what matches as it is typed, the
 * albums as tiles in a row and the tracks as a list that plays from the one
 * touched.
 */
export default function SearchPage() {
  const trpc = useTRPC();
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), settle);
    return () => clearTimeout(timer);
  }, [typed]);
  const found = useQuery(trpc.library.search.queryOptions({ query }, { enabled: query.length > 0, placeholderData: keepPreviousData }));
  const data = query ? found.data : undefined;
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace();

  return (
    <Screen scrollY={scrollY} title="Search" back>
      <Animated.ScrollView {...scrollProps} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingTop: top, paddingBottom: bottom, gap: space.lg }}>
        <View style={{ paddingHorizontal: space.lg }}>
          <Inset style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, height: 46 }}>
            <SearchIcon size={18} color={deck.chrome2} />
            <TextInput
              autoFocus
              value={typed}
              onChangeText={setTyped}
              placeholder="Albums, artists, tracks"
              placeholderTextColor={deck.chrome2}
              selectionColor={deck.chrome}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              keyboardAppearance="dark"
              accessibilityLabel="Search"
              style={{ flex: 1, height: 46, fontFamily: font.body, fontSize: 16.5, color: deck.chrome }}
            />
          </Inset>
        </View>
        {found.isError && query ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Note>Couldn&apos;t reach the server.</Note>
          </View>
        ) : null}
        {data && !data.albums.length && !data.tracks.length ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Note>{`Nothing matches “${query}”.`}</Note>
          </View>
        ) : null}
        {data?.albums.length ? (
          <View>
            <View style={{ paddingHorizontal: space.lg, zIndex: 1 }}>
              <SectionHeading title="Albums" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: -24 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: 24, paddingBottom: 30, gap: space.md }}>
              {data.albums.map((album) => (
                <AlbumTile key={album.id} album={album} style={{ width: 132 }} />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {data?.tracks.length ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <SectionHeading title="Tracks" />
            <TrackList tracks={data.tracks} showCover />
          </View>
        ) : null}
      </Animated.ScrollView>
    </Screen>
  );
}
