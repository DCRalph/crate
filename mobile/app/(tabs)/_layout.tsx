import { Redirect, Tabs } from "expo-router";

import { TabBar } from "@/components/tab-bar";
import { useActiveServer } from "@/lib/servers";
import { usePalette } from "@/lib/theme";

export const unstable_settings = { anchor: "index" };

/**
 * The library's pages, over the deck and the tabs (`TabBar`). An album and a
 * playlist are pages in here too, with no tab of their own, so the deck stays
 * under them. With no server paired there is nothing to show, and the person
 * is sent to add one.
 */
export default function TabsLayout() {
  const palette = usePalette();
  const server = useActiveServer();
  if (!server) return <Redirect href="/servers/add" />;
  return (
    <Tabs backBehavior="history" tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.cab } }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="albums" options={{ title: "Albums" }} />
      <Tabs.Screen name="playlists" options={{ title: "Playlists" }} />
      <Tabs.Screen name="downloads" options={{ title: "Kept" }} />
      <Tabs.Screen name="album/[id]" options={{ href: null }} />
      <Tabs.Screen name="playlist/[id]" options={{ href: null }} />
    </Tabs>
  );
}
