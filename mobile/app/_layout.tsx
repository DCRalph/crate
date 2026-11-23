import { useEffect } from "react";
import { AppState } from "react-native";
import { BigShouldersDisplay_700Bold, BigShouldersDisplay_800ExtraBold } from "@expo-google-fonts/big-shoulders-display";
import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold } from "@expo-google-fonts/jost";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Deck } from "@/components/deck";
import { ServerProvider } from "@/lib/api";
import { useDownloads } from "@/lib/downloads";
import { useActiveServer, useServers } from "@/lib/servers";
import { useSettings } from "@/lib/settings";
import { usePalette } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync();

/**
 * The app's frame. It waits for the fonts and for the saved servers and
 * downloads, then shows the pages: a native stack, with the tabs at its foot
 * and an album, a playlist or the settings pushed over them, so going back is
 * the system's own swipe. The deck floats over all of it. Everything inside
 * talks to the server in use; with none paired yet, the tabs send the person
 * to add one.
 */
export default function RootLayout() {
  const palette = usePalette();
  const [fontsLoaded] = useFonts({ Jost_400Regular, Jost_500Medium, Jost_600SemiBold, BigShouldersDisplay_700Bold, BigShouldersDisplay_800ExtraBold });
  const ready = useServers((state) => state.ready);
  const server = useActiveServer();

  useEffect(() => {
    // Settings first: they say which connections downloads may use.
    useSettings.getState().load();
    useDownloads.getState().load();
    const sync = () => void useDownloads.getState().sync();
    void useServers.getState().load().then(sync);
    // And again each time the app is come back to.
    const returned = AppState.addEventListener("change", (state) => state === "active" && sync());
    return () => returned.remove();
  }, []);
  useEffect(() => {
    if (fontsLoaded && ready) void SplashScreen.hideAsync();
  }, [fontsLoaded, ready]);
  if (!fontsLoaded || !ready) return null;

  // The navigator paints its own background, which shows at the corners of a page being swiped away.
  const base = palette.isNight ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: palette.cab, card: palette.cab, text: palette.chrome, border: palette.line, primary: palette.chrome } };
  const pages = (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.cab } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="album/[id]" />
        <Stack.Screen name="playlist/[id]" />
        <Stack.Screen name="now-playing" options={{ presentation: "modal" }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="servers/index" />
        <Stack.Screen name="servers/add" options={{ presentation: "modal" }} />
      </Stack>
      <Deck />
    </>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.cab }}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <StatusBar style={palette.isNight ? "light" : "dark"} />
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
