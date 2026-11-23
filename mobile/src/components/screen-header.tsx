import { useRef, type ReactNode } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { font, space, usePalette } from "@/lib/theme";

/** Height of the pinned bar below the status bar. */
export const headerHeight = 52;
/** The soft edge under the bar once it is solid, so content fades out rather than cuts. */
const headerTail = 20;

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
 * back, the page's name lettered large, and its buttons. At rest it has no
 * ground of its own; once the page moves it fills in with the cabinet's
 * colour, with a short fade below so content dissolves into it.
 *  - `titleAt`: for a page that letters its own name in its content, the scroll offset at which the bar takes the name over. Without it the name is always there.
 */
export function PinnedHeader({ scrollY, title, titleAt, left, right }: { scrollY: Animated.Value; title?: string; titleAt?: number; left?: ReactNode; right?: ReactNode }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const height = insets.top + headerHeight;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingTop: insets.top, height }]}>
      {/* Solid rather than glass: a blur under an animated opacity renders wrong on iOS. */}
      <Animated.View pointerEvents="none" style={[styles.backdrop, { height, backgroundColor: palette.cab, opacity: reveal(scrollY, 10, 10) }]}>
        <Fade from={palette.cab} style={{ top: height, height: headerTail }} />
      </Animated.View>
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
  backdrop: { position: "absolute", top: 0, left: 0, right: 0 },
  fade: { position: "absolute", left: 0, right: 0 },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: space.md },
  title: { flex: 1, fontFamily: font.title, fontSize: 30, lineHeight: 36, textTransform: "uppercase", letterSpacing: 0.4 },
});
