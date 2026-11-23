import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { Animated, Pressable, Text, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { Card, Cover, Lamp, Note } from "@/components/ui";
import { progressOf, useDownloads } from "@/lib/downloads";
import { count, formatBytes } from "@/lib/format";
import { useActiveServer } from "@/lib/servers";
import { font, ink, ink2, space, usePalette } from "@/lib/theme";

/**
 * What is kept on this phone from the server in use: each playlist, how much
 * of it has arrived, and how much room it takes. Everything here opens and
 * plays with no connection. It is stored sealed; see Settings.
 */
export default function Kept() {
  const router = useRouter();
  const palette = usePalette();
  const server = useActiveServer();
  const shelf = useDownloads((state) => (server ? state.shelves[server.id] : undefined));
  const playlists = Object.values(shelf?.playlists ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  const bytes = Object.values(shelf?.tracks ?? {}).reduce((sum, kept) => sum + kept.bytes, 0);
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace(true);

  return (
    <Screen scrollY={scrollY} title="Kept" settings>
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingTop: top + space.sm, paddingHorizontal: space.lg, paddingBottom: bottom, gap: space.md }}>
        {playlists.length ? <Note>{`${count(playlists.length, "playlist")}, ${formatBytes(bytes)}`}</Note> : null}
        {playlists.length ? (
          <Card>
            {playlists.map((playlist, index) => {
              const progress = progressOf(shelf, playlist.id);
              const done = !!progress && progress.done === progress.total;
              return (
                <Pressable
                  key={playlist.id}
                  accessibilityRole="button"
                  accessibilityLabel={playlist.name}
                  onPress={() => router.push(`/playlist/${playlist.id}`)}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 8, borderTopWidth: index ? 1 : 0, borderTopColor: palette.stripLine, backgroundColor: pressed ? palette.strip2 : "transparent" })}
                >
                  <Cover type="playlist" id={playlist.id} size={160} version={playlist.coverKey} style={{ width: 46, borderRadius: 3 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 15.5, color: ink }}>
                      {playlist.name}
                    </Text>
                    <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>
                      {progress ? (done ? `${count(progress.total, "track")}, ${formatBytes(progress.bytes)}` : `${progress.done} of ${count(progress.total, "track")} so far`) : ""}
                    </Text>
                  </View>
                  {done ? <Check size={16} color={ink2} /> : <Lamp lit on="print" />}
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <Note>Nothing kept yet. Open a playlist and press Keep, and it plays here with no connection.</Note>
        )}
      </Animated.ScrollView>
    </Screen>
  );
}
