import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowDownToLine, Pin, Plus } from "lucide-react-native";
import { Animated, Pressable, Text, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { GlassButton } from "@/components/glass";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { Card, Cover, Note } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { useDownloads } from "@/lib/downloads";
import { count } from "@/lib/format";
import { useActiveServer } from "@/lib/servers";
import { font, ink, ink2, space, usePalette } from "@/lib/theme";

/**
 * Every playlist the person can see, as one printed list: pinned ones first,
 * then by name. The server keeps playlists in folders; here a playlist's
 * folders are the small line under its name.
 */
export default function Playlists() {
  const trpc = useTRPC();
  const router = useRouter();
  const palette = usePalette();
  const server = useActiveServer();
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const downloaded = useDownloads((state) => (server ? state.shelves[server.id]?.playlists : undefined));
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace(true);

  const folders = new Map((tree.data?.folders ?? []).map((folder) => [folder.id, folder]));
  const pathOf = (folderId: number | null): string[] => {
    const folder = folderId === null ? undefined : folders.get(folderId);
    return folder ? [...pathOf(folder.parentId), folder.name] : [];
  };
  const playlists = [...(tree.data?.playlists ?? [])].sort((a, b) => Number(!!b.pinnedAt) - Number(!!a.pinnedAt));

  return (
    <Screen scrollY={scrollY} title="Playlists" search settings action={<GlassButton label="New playlist" icon={Plus} onPress={() => router.push("/playlist/new")} />}>
      <Animated.FlatList
        {...scrollProps}
        data={playlists}
        keyExtractor={(playlist) => String(playlist.id)}
        contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: bottom }}
        ListEmptyComponent={tree.isPending ? null : <Note>{tree.isError ? "Couldn't reach the server. What you have downloaded is under Downloads." : "No playlists yet."}</Note>}
        renderItem={({ item, index }) => (
          <Card style={{ borderRadius: 0, borderTopLeftRadius: index ? 0 : 8, borderTopRightRadius: index ? 0 : 8, borderBottomLeftRadius: index === playlists.length - 1 ? 8 : 0, borderBottomRightRadius: index === playlists.length - 1 ? 8 : 0 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => router.push(`/playlist/${item.id}`)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderTopWidth: index ? 1 : 0, borderTopColor: palette.stripLine, backgroundColor: pressed ? palette.strip2 : "transparent" })}
            >
              <Cover type="playlist" id={item.id} size={160} version={item.coverKey} style={{ width: 46, borderRadius: 3 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 15.5, color: ink }}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>
                  {[count(item.trackCount, "track"), pathOf(item.folderId).join(" / ")].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {downloaded?.[item.id] ? <ArrowDownToLine size={15} color={ink2} /> : null}
              {item.pinnedAt ? <Pin size={14} color={ink2} fill={ink2} /> : null}
            </Pressable>
          </Card>
        )}
      />
    </Screen>
  );
}
