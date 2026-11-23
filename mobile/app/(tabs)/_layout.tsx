import { Redirect, Tabs } from "expo-router";

import { TabBar } from "@/components/tab-bar";
import { useActiveServer } from "@/lib/servers";
import { usePalette } from "@/lib/theme";

export const unstable_settings = { anchor: "index" };

/**
 * The library's four pages, under the floating glass tabs (`TabBar`). An
 * album or a playlist is pushed over these from the root stack. With no server
 * paired there is nothing to show, and the person is sent to add one.
 */
export default function TabsLayout() {
  const palette = usePalette();
  const server = useActiveServer();
  if (!server) return <Redirect href="/servers/add" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.cab } }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="albums" options={{ title: "Albums" }} />
      <Tabs.Screen name="playlists" options={{ title: "Playlists" }} />
      <Tabs.Screen name="downloads" options={{ title: "Downloads" }} />
    </Tabs>
  );
}
