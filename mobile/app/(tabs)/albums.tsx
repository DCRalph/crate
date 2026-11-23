import { useInfiniteQuery } from "@tanstack/react-query";
import { FlatList, View } from "react-native";

import { Screen } from "@/components/screen";
import { AlbumTile } from "@/components/tile";
import { Note, Title } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { space } from "@/lib/theme";

/** Every album the person can reach, newest first, two to a row. More arrive as the end comes near. */
export default function Albums() {
  const trpc = useTRPC();
  const albums = useInfiniteQuery(trpc.library.albums.infiniteQueryOptions({ sort: "added" }, { getNextPageParam: (last) => last.nextCursor }));
  const items = albums.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(album) => String(album.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{ padding: space.lg, gap: space.lg }}
        ListHeaderComponent={<Title>Albums</Title>}
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
