import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Card, Cover, Key, Note } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { count } from "@/lib/format";
import { bad, font, ink, ink2, space, usePalette } from "@/lib/theme";

/** Puts one track (`trackId`) in a playlist: touch one of the playlists this person may change, or start a new one with it. */
export default function AddToPlaylist() {
  const router = useRouter();
  const palette = usePalette();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const trackId = Number(useLocalSearchParams<{ trackId: string }>().trackId);
  const tree = useQuery(trpc.playlists.tree.queryOptions());
  const playlists = (tree.data?.playlists ?? []).filter((playlist) => playlist.canEdit);
  const add = useMutation(
    trpc.playlists.addTracks.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.playlists.pathFilter());
        router.back();
      },
    }),
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: palette.cab }} contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      <Text style={{ fontFamily: font.title, fontSize: 30, color: palette.chrome, textTransform: "uppercase" }}>Add to a playlist</Text>
      {add.error ? <Text style={{ fontFamily: font.medium, fontSize: 14, color: bad }}>{add.error.message}</Text> : null}
      {playlists.length ? (
        <Card>
          {playlists.map((playlist, index) => (
            <Pressable
              key={playlist.id}
              accessibilityRole="button"
              accessibilityLabel={playlist.name}
              disabled={add.isPending}
              onPress={() => add.mutate({ id: playlist.id, trackIds: [trackId] })}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderTopWidth: index ? 1 : 0, borderTopColor: palette.stripLine, backgroundColor: pressed ? palette.strip2 : "transparent" })}
            >
              <Cover type="playlist" id={playlist.id} size={160} version={playlist.coverKey} style={{ width: 46, borderRadius: 3 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 15.5, color: ink }}>
                  {playlist.name}
                </Text>
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>{count(playlist.trackCount, "track")}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ) : tree.isPending ? null : (
        <Note>{tree.isError ? "Couldn't reach the server." : "No playlists of yours to add to yet."}</Note>
      )}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Key tone="brand" icon={Plus} label="New playlist" onPress={() => router.replace({ pathname: "/playlist/new", params: { trackId: String(trackId) } })} />
        <Key label="Cancel" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
