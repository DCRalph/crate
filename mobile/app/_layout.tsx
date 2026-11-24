import { useEffect } from "react";
import { Appearance, AppState } from "react-native";
import { BigShouldersDisplay_700Bold, BigShouldersDisplay_800ExtraBold } from "@expo-google-fonts/big-shoulders-display";
import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold } from "@expo-google-fonts/jost";
import { useFonts } from "expo-font";
import { DarkTheme, Stack, ThemeProvider, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Deck } from "@/components/deck";
import { ServerProvider } from "@/lib/api";
import { watchCar } from "@/lib/car";
import { useDownloads } from "@/lib/downloads";
import { watchNetwork } from "@/lib/network";
import { usePlayer } from "@/lib/player";
import { useActiveServer, useServers } from "@/lib/servers";
import { useSettings } from "@/lib/settings";
import { glass, usePalette } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

/**
 * The app's frame. It waits for the fonts and for the saved servers and
 * downloads, then shows the pages: a native stack, with the tabs at its foot
 * and an album, a playlist or the settings pushed over them, so going back is
 * the system's own swipe. The library is behind glass, which is dark at any
 * hour; the settings and servers are on the cabinet, which follows day and
 * night. The deck floats over all of it. Everything inside
 * talks to the server in use; with none paired yet, the tabs send the person
 * to add one.
 */
export default function RootLayout() {
  const palette = usePalette();
  const [fontsLoaded] = useFonts({ Jost_400Regular, Jost_500Medium, Jost_600SemiBold, BigShouldersDisplay_700Bold, BigShouldersDisplay_800ExtraBold });
  const ready = useServers((state) => state.ready);
  const server = useActiveServer();
  const [section] = useSegments();
  const onCabinet = section === "settings" || section === "servers";

  useEffect(() => {
    // Settings first: they say which connections downloads may use.
    useSettings.getState().load();
    watchNetwork();
    watchCar();
    useDownloads.getState().load();
    // What the server has that this phone should know about: changes to downloaded playlists, and a queue from another device.
    const sync = () => {
      void useDownloads.getState().sync();
      void usePlayer.getState().checkOffer();
    };
    void useServers
      .getState()
      .load()
      .then(() => {
        // The queue from last time, paused where it was.
        usePlayer.getState().restore();
        sync();
      });
    // And again each time the app is come back to.
    const returned = AppState.addEventListener("change", (state) => state === "active" && sync());
    return () => returned.remove();
  }, []);

  // A server just come to (added, or switched to) may hold a queue from another device.
  const serverId = server?.id;
  useEffect(() => {
    if (serverId) void usePlayer.getState().checkOffer();
  }, [serverId]);

  // Day or night as Settings has it: told to the system, so its own parts (the keyboard, alerts, glass) agree with ours.
  const appearance = useSettings((state) => state.appearance);
  useEffect(() => {
    Appearance.setColorScheme(appearance === "auto" ? "unspecified" : appearance === "night" ? "dark" : "light");
  }, [appearance]);
  useEffect(() => {
    if (fontsLoaded && ready) void SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);
  if (!fontsLoaded || !ready) return null;

  // The navigator paints its own background, which shows at the corners of a page being swiped away: glass, as most pages are.
  const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: glass, card: glass, text: palette.chrome, border: palette.line, primary: palette.chrome } };
  const pages = (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: glass } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="album/[id]" />
        <Stack.Screen name="playlist/[id]" />
        <Stack.Screen name="playlist/[id]/edit" />
        <Stack.Screen name="playlist/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="playlist/add" options={{ presentation: "modal" }} />
        <Stack.Screen name="now-playing" options={{ presentation: "modal" }} />
        <Stack.Screen name="search" />
        <Stack.Screen name="most-played" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="servers/index" />
        <Stack.Screen name="servers/add" options={{ presentation: "modal" }} />
      </Stack>
      <Deck />
    </>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: glass }}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          {/* Light on glass; on the cabinet, whatever reads on it. */}
          <StatusBar style={onCabinet && !palette.isNight ? "dark" : "light"} />
          {/* Keyed by server, so changing server starts with nothing remembered from the last one. */}
          {server ? (
            <ServerProvider key={server.id} server={server}>
              {pages}
            </ServerProvider>
          ) : (
            pages
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
