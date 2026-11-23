import { useRef, type ReactNode } from "react";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { font, space, usePalette } from "@/lib/theme";

/** Height of the pinned bar below the status bar. */
export const headerHeight = 52;
/** How far below the bar its blur runs on, thinning to nothing, so content goes soft before it goes under. */
const headerTail = 28;

/**
 * Scroll position for a page with a pinned bar. Spread `scrollProps` on an
 * `Animated.ScrollView` or `Animated.FlatList`; the offset runs on the native
 * driver, so the bar never waits on JS.
 */
export function useScrollHeader() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true });
  return { scrollY, scrollProps: { onScroll, scrollEventThrottle: 16 } };
}

/** 0 at rest, 1 once `scrollY` reaches `at`, over the last `over` points. */
const reveal = (scrollY: Animated.Value, at: number, over = 16) => scrollY.interpolate({ inputRange: [Math.max(0, at - over), at], outputRange: [0, 1], extrapolate: "clamp" });

/**
 * The bar pinned over the top of a scrolling page: one line holding the way
 * back, the page's name lettered large, and its buttons. It has no ground of
 * its own. The page scrolls up behind it through a blur that is full under
 * the line and thins to nothing just below, as under the bars of the system's
 * own apps; once the page has moved, a wash of the cabinet's colour comes in
 * over the blur so the name stays easy to read over whatever is passing.
 *  - `titleAt`: for a page that letters its own name in its content, the scroll offset at which the bar takes the name over. Without it the name is always there.
 */
export function PinnedHeader({ scrollY, title, titleAt, left, right }: { scrollY: Animated.Value; title?: string; titleAt?: number; left?: ReactNode; right?: ReactNode }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const height = insets.top + headerHeight;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top, height }]}>
      <MaskedView
        pointerEvents="none"
        style={[styles.ground, { height: height + headerTail }]}
        // Whole under the bar, then thinning away: the blur has no edge to see.
        maskElement={
          <View style={{ flex: 1 }}>
            <View style={{ height, backgroundColor: "#000" }} />
            <Fade from="#000" style={{ top: height, height: headerTail }} />
          </View>
        }
      >
        {/* The blur is always there, and shows only once something is under it; its opacity is never animated, which iOS draws wrongly. */}
        <BlurView tint={palette.isNight ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"} intensity={80} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.cab, opacity: reveal(scrollY, 12, 12).interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }) }]} />
      </MaskedView>
      <View pointerEvents="box-none" style={styles.row}>
        {left}
        <Animated.Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: palette.chrome, opacity: titleAt === undefined ? 1 : reveal(scrollY, titleAt) }]}>
          {title}
        </Animated.Text>
        {right}
      </View>
    </View>
  );
}

/** Room a page leaves above its content, for the pinned bar. */
export function useHeaderSpace() {
  return useSafeAreaInsets().top + headerHeight;
}

/** Content dissolving into the cabinet at the bottom edge, under the floating tabs and deck. Fixed, and ignores touches. */
export function BottomFade({ height }: { height: number }) {
  const palette = usePalette();
  // Keyed by height: the gradient is not redrawn when its box changes size, as it does when the deck arrives.
  return <Fade key={height} from={palette.cab} up style={{ bottom: 0, height }} />;
}

/** A full-width vertical gradient from `from` to clear; `up` puts the colour at the bottom instead of the top. */
export function Fade({ from, up, style }: { from: string; up?: boolean; style: { top?: number; bottom?: number; height: number } }) {
  return (
    <Svg pointerEvents="none" style={[styles.fade, style]} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="fade" x1="0" y1={up ? "1" : "0"} x2="0" y2={up ? "0" : "1"}>
          <Stop offset="0" stopColor={from} stopOpacity="1" />
          <Stop offset="0.5" stopColor={from} stopOpacity="0.6" />
          <Stop offset="1" stopColor={from} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  ground: { position: "absolute", top: 0, left: 0, right: 0 },
  fade: { position: "absolute", left: 0, right: 0 },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: space.md },
  title: { flex: 1, fontFamily: font.title, fontSize: 30, lineHeight: 36, textTransform: "uppercase", letterSpacing: 0.4 },
});
