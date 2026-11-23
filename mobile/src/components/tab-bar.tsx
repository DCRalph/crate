import type { BottomTabBarProps } from "expo-router/tabs";
import { ArrowDownToLine, Disc3, House, ListMusic, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ink, label, usePalette } from "@/lib/theme";
import { Deck } from "./deck";

const icons: Record<string, LucideIcon> = { index: House, albums: Disc3, playlists: ListMusic, downloads: ArrowDownToLine };

/**
 * The bottom of the app: the deck, then the tabs. The tabs hang from an ivory
 * line the way the website's stand on one, and the page you are on is the
 * ivory tab. Routes that aren't in `icons` (an album, a playlist) are pages
 * inside the tabs with no tab of their own.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View>
      <Deck />
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 10, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: palette.cab2, borderTopWidth: 3, borderTopColor: palette.strip }}>
        {state.routes.map((route, index) => {
          const Icon = icons[route.name];
          if (!Icon) return null;
          const active = state.index === index;
          const title = descriptors[route.key]?.options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={title}
              onPress={() => navigation.navigate(route.name)}
              style={{ flex: 1, alignItems: "center", gap: 3, paddingTop: 7, paddingBottom: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: active ? palette.strip : "transparent" }}
            >
              <Icon size={18} color={active ? ink : palette.chrome2} />
              <Text style={[label, { fontSize: 10.5, color: active ? ink : palette.chrome }]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
