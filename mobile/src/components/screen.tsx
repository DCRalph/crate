import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { ChevronLeft, Settings } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { font, label, space, usePalette } from "@/lib/theme";
import { Mark } from "./ui";

/**
 * A page on the cabinet: the bar across the top, then its content. The bar
 * carries the wordmark and the server's name, and the way to settings; on a
 * page reached from another it has `back` in place of the wordmark.
 */
export function Screen({ children, back, bare = false }: { children: ReactNode; back?: string; bare?: boolean }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const server = useActiveServer();
  const playing = usePlayer((state) => state.playing);

  return (
    <View style={{ flex: 1, backgroundColor: palette.cab }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: space.lg, paddingBottom: 8, backgroundColor: palette.cab2, borderBottomWidth: 3, borderBottomColor: palette.strip, flexDirection: "row", alignItems: "center", gap: space.md }}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel={back === "Back" ? "Back" : `Back to ${back}`} hitSlop={10} onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -6 }}>
            <ChevronLeft size={20} color={palette.chrome} />
            <Text style={[label, { color: palette.chrome, fontSize: 12.5 }]}>{back}</Text>
          </Pressable>
        ) : (
          <Mark lit={playing} />
        )}
        <View style={{ flex: 1 }} />
        {bare || !server ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={10} onPress={() => router.push("/settings")} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 13, color: palette.chrome2, maxWidth: 150 }}>
              {server.user.username}
            </Text>
            <Settings size={19} color={palette.chrome} />
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}
