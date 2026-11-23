import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Animated, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { Card, Key, Lamp, Note } from "@/components/ui";
import { usePlayer } from "@/lib/player";
import { useServers } from "@/lib/servers";
import { font, ink, ink2, space, usePalette } from "@/lib/theme";

/** The servers this phone is paired with. Touch one to use it; the lit lamp is the one in use. */
export default function Servers() {
  const router = useRouter();
  const palette = usePalette();
  const servers = useServers((state) => state.servers);
  const activeId = useServers((state) => state.activeId);
  const { scrollY, scrollProps } = useScrollHeader();
  const insets = useSafeAreaInsets();
  const top = useHeaderSpace();

  return (
    <Screen scrollY={scrollY} title="Servers" left="back">
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
        {servers.length ? (
          <Card>
            {servers.map((server, index) => (
              <Pressable
                key={server.id}
                accessibilityRole="button"
                accessibilityState={{ selected: server.id === activeId }}
                accessibilityLabel={`${server.name}, ${server.user.username}`}
                onPress={() => {
                  if (server.id === activeId) return router.back();
                  // The queue belongs to the server it was played from.
                  usePlayer.getState().stop();
                  useServers.getState().setActive(server.id);
                  router.dismissAll();
                }}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderTopWidth: index ? 1 : 0, borderTopColor: palette.stripLine, backgroundColor: pressed ? palette.strip2 : "transparent" })}
              >
                <Lamp lit={server.id === activeId} on="print" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 15.5, color: ink }}>
                    {server.name}
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>
                    {`${server.user.username} at ${server.url.replace(/^https?:\/\//, "")}`}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Card>
        ) : (
          <Note>No servers yet.</Note>
        )}
        <View style={{ flexDirection: "row" }}>
          <Key tone="brand" icon={Plus} label="Add a server" onPress={() => router.push("/servers/add")} />
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}
