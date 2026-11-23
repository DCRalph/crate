import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { ChevronLeft, Search, Settings } from "lucide-react-native";
import { StyleSheet, View, type Animated } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { GroundContext, glass, usePalette, type Ground } from "@/lib/theme";
import { GlassButton } from "./glass";
import { PinnedHeader } from "./screen-header";

/** The glass window's own light: a faint sheen across its top, as the website's `glass-window`. Still, and under everything. */
export function GlassGround() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glass }]}>
      <Svg width="100%" height={420} style={{ position: "absolute", top: 0 }}>
        <Defs>
          <RadialGradient id="sheen" cx="50%" cy="0%" rx="120%" ry="100%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.06" />
            <Stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sheen)" />
      </Svg>
    </View>
  );
}

/**
 * A page: its scrolling content, under a bar pinned over the top
 * (`PinnedHeader`). The page owns the scroller and hands over `scrollY` from
 * `useScrollHeader`.
 *  - `ground`: what the page is set on. The library is behind the glass window, edge to edge; the settings are on the cabinet. What is drawn on the page takes its colours from it (`useGround`).
 *  - `title`: the page's name, lettered large on the bar's one line with its buttons. With `titleAt` it arrives only once the page has scrolled that far, for a page that letters its own name.
 *  - `back`: a round glass Back first on the bar, for a page reached from another.
 *  - `search`, `settings`: round glass keys to Search and to Settings.
 *  - `action`: another round glass key of the page's own, before them.
 */
export function Screen({
  children,
  scrollY,
  ground = "glass",
  title,
  titleAt,
  back = false,
  search = false,
  settings = false,
  action,
}: {
  children: ReactNode;
  scrollY: Animated.Value;
  ground?: Ground;
  title?: string;
  titleAt?: number;
  back?: boolean;
  search?: boolean;
  settings?: boolean;
  action?: ReactNode;
}) {
  const palette = usePalette();
  const router = useRouter();
  // A page opened cold has nothing behind it to go back to.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <GroundContext value={ground}>
      <View style={{ flex: 1, backgroundColor: ground === "glass" ? glass : palette.cab }}>
        {ground === "glass" ? <GlassGround /> : null}
        {children}
        <PinnedHeader
          scrollY={scrollY}
          title={title}
          titleAt={titleAt}
          left={back ? <GlassButton label="Back" icon={ChevronLeft} onPress={goBack} /> : null}
          right={
            action || search || settings ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {action}
                {search ? <GlassButton label="Search" icon={Search} onPress={() => router.push("/search")} /> : null}
                {settings ? <GlassButton label="Settings" icon={Settings} onPress={() => router.push("/settings")} /> : null}
              </View>
            ) : null
          }
        />
      </View>
    </GroundContext>
  );
}
