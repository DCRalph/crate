import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { ChevronLeft, Settings } from "lucide-react-native";
import { View, type Animated } from "react-native";

import { usePlayer } from "@/lib/player";
import { usePalette } from "@/lib/theme";
import { GlassButton } from "./glass";
import { PinnedHeader } from "./screen-header";
import { Mark } from "./ui";

/**
 * A page on the cabinet: its scrolling content, under a bar pinned over the
 * top (`PinnedHeader`). The page owns the scroller and hands over `scrollY`
 * from `useScrollHeader`.
 *  - `title`: the page's name, on the bar's one line with its buttons. With `titleAt` it arrives only once the page has scrolled that far, for a page that letters its own name.
 *  - `left`: the wordmark, on the page the app opens on, or a round glass Back on a page reached from another.
 *  - `settings`: a round glass key to Settings.
 */
export function Screen({ children, scrollY, title, titleAt, left, settings = false }: { children: ReactNode; scrollY: Animated.Value; title?: string; titleAt?: number; left?: "mark" | "back"; settings?: boolean }) {
  const palette = usePalette();
  const router = useRouter();
  const playing = usePlayer((state) => state.playing);
  // A page opened cold has nothing behind it to go back to.
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <View style={{ flex: 1, backgroundColor: palette.cab }}>
      {children}
      <PinnedHeader
        scrollY={scrollY}
        title={title}
        titleAt={titleAt}
        left={left === "back" ? <GlassButton label="Back" icon={ChevronLeft} onPress={back} /> : left === "mark" ? <Mark lit={playing} /> : null}
        right={settings ? <GlassButton label="Settings" icon={Settings} onPress={() => router.push("/settings")} /> : null}
      />
    </View>
  );
}
