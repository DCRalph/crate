import { useInfiniteQuery } from "@tanstack/react-query";
import { Animated, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { AlbumTile } from "@/components/tile";
import { Note } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { space } from "@/lib/theme";

/** Every album the person can reach, newest first, two to a row. More arrive as the end comes near. */
export default function Albums() {
  const trpc = useTRPC();
  const albums = useInfiniteQuery(trpc.library.albums.infiniteQueryOptions({ sort: "added" }, { getNextPageParam: (last) => last.nextCursor }));
  const items = albums.data?.pages.flatMap((page) => page.items) ?? [];
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace(true);

  return (
    <Screen scrollY={scrollY} title="Albums" search settings>
      <Animated.FlatList
        {...scrollProps}
        data={items}
        keyExtractor={(album) => String(album.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        // Room under each row for the light its tiles throw.
        contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: bottom, gap: space.xl }}
        ListEmptyComponent={albums.isPending ? null : <Note>{albums.isError ? "Couldn't reach the server." : "No albums yet."}</Note>}
        renderItem={({ item }) => (
          <View style={{ flex: 1 }}>
            <AlbumTile album={item} />
          </View>
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => albums.hasNextPage && !albums.isFetchingNextPage && void albums.fetchNextPage()}
      />
    </Screen>
  );
}
