import { useRef, type ReactNode } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { font, label, space, usePalette } from "@/lib/theme";

/** Height of the pinned bar below the status bar. */
export const headerHeight = 52;
/** How far a `LargeTitle` scrolls before the bar takes over its name. */
const largeTitleReveal = 50;
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
 * The bar pinned over the top of a scrolling page, in the manner of an iOS
 * large title. At rest it is only its buttons, floating; once the page moves
 * it fills in with the cabinet's colour, with a short fade below so content
 * dissolves into it, and the small `title` arrives when the page's own large
 * title has gone under. `left` and `right` are always on screen.
 */
export function PinnedHeader({ scrollY, title, titleAt = largeTitleReveal, left, right }: { scrollY: Animated.Value; title?: string; titleAt?: number; left?: ReactNode; right?: ReactNode }) {
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
        <View style={styles.side}>{left}</View>
        {title ? (
          <Animated.Text numberOfLines={1} style={[label, styles.title, { color: palette.chrome, opacity: reveal(scrollY, titleAt) }]}>
            {title}
          </Animated.Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
      </View>
    </View>
  );
}

/** Room a page with no large title leaves above its content, for the pinned bar. */
export function useHeaderSpace() {
  return useSafeAreaInsets().top + headerHeight;
}

/** The large title a page opens on, just under the pinned bar. Its name passes to the bar as it scrolls away. */
export function LargeTitle({ children, note }: { children: string; note?: string }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + headerHeight, flexDirection: "row", alignItems: "baseline", gap: space.md, marginBottom: space.md }}>
      <Text style={{ fontFamily: font.title, fontSize: 40, lineHeight: 44, color: palette.chrome, textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</Text>
      {note ? <Text style={{ fontFamily: font.body, fontSize: 13.5, color: palette.chrome2 }}>{note}</Text> : null}
    </View>
  );
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
  side: { minWidth: 44, flexShrink: 0 },
  title: { flex: 1, fontSize: 13.5, textAlign: "center" },
});
