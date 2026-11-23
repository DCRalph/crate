import { useEffect } from "react";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/tabs";
import { ArrowDownToLine, Disc3, House, ListMusic, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ink, label, space, usePalette } from "@/lib/theme";
import { floatOffset, floatSpring, tabBarHeight, useBottomSpace } from "./bottom";
import { Glass } from "./glass";
import { BottomFade } from "./screen-header";

/** The padding inside the capsule, a tab's width as a sign alone and as the ivory pill that names it. */
const pad = 6;
const iconWidth = 46;
const pillWidth = 124;
const gap = 2;
const iconSize = 20;
/** How much wider the pill gets halfway between two tabs. */
const stretch = 16;

const icons: Record<string, LucideIcon> = { index: House, albums: Disc3, playlists: ListMusic, downloads: ArrowDownToLine };

/**
 * The tabs: a small glass capsule floating at the foot of the page. A tab is
 * its sign alone until it is the page you are on, when it sits in an ivory
 * pill that names it, as the website's current tab is the ivory one. A change
 * slides the one pill across, stretching a little in flight, while the tabs it
 * leaves and reaches trade width under it. The page dissolves into the cabinet
 * before it reaches the capsule, so the signs stay readable.
 *
 * Everything follows `position`, the tab in use as a spring: a whole number at
 * rest, and between two tabs its fraction says how far across the pill is.
 * Exactly one tab's width is ever the pill, so the capsule never changes size.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const bottom = floatOffset(insets.bottom);
  const fade = useBottomSpace(true) + space.xl;
  const count = state.routes.length;

  const position = useSharedValue(state.index);
  useEffect(() => {
    position.value = withSpring(state.index, floatSpring);
  }, [position, state.index]);

  const indicator = useAnimatedStyle(() => {
    // 0 at either tab, 1 halfway.
    const travel = Math.sin(Math.PI * (position.value - Math.floor(position.value)));
    return { width: pillWidth + stretch * travel, transform: [{ translateX: pad + position.value * (iconWidth + gap) - (stretch / 2) * travel }] };
  });

  return (
    <>
      <BottomFade height={fade} />
      <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
        <Glass interactive style={[styles.bar, { width: pillWidth + (iconWidth + gap) * (count - 1) + pad * 2 }]}>
          <Animated.View pointerEvents="none" style={[styles.pill, { backgroundColor: palette.strip }, indicator]} />
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            return (
              <Tab
                key={route.key}
                index={index}
                position={position}
                label={descriptors[route.key]?.options.title ?? route.name}
                Icon={icons[route.name] ?? House}
                focused={focused}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    void Haptics.selectionAsync();
                    navigation.navigate(route.name, route.params);
                  }
                }}
              />
            );
          })}
        </Glass>
      </View>
    </>
  );
}

/** How much of the pill is over tab `index` when it is at `position`: 1 at home, 0 once it is a whole tab away. */
function shareOf(position: number, index: number) {
  "worklet";
  return Math.max(0, 1 - Math.abs(position - index));
}

function Tab({ index, position, label: text, Icon, focused, onPress }: { index: number; position: SharedValue<number>; label: string; Icon: LucideIcon; focused: boolean; onPress: () => void }) {
  const palette = usePalette();
  // Only the tab arrived at names itself: on a jump across several, the ones the pill passes over stay signs.
  const named = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    named.value = withTiming(focused ? 1 : 0, { duration: focused ? 220 : 90 });
  }, [named, focused]);

  const tab = useAnimatedStyle(() => {
    const share = shareOf(position.value, index);
    // The padding centres the sign in a round tab, and gives the pill its inset.
    return { width: iconWidth + (pillWidth - iconWidth) * share, paddingLeft: interpolate(share, [0, 1], [(iconWidth - iconSize) / 2, 16]) };
  });
  // The sign is drawn twice, for glass and for ivory, and cross-faded as the pill passes: its colour is a prop, which a native animation can't reach.
  const onGlass = useAnimatedStyle(() => ({ opacity: 1 - shareOf(position.value, index) }));
  const onPill = useAnimatedStyle(() => ({ opacity: shareOf(position.value, index) }));
  // The name arrives late and leaves early, so a narrow tab never squeezes it.
  const name = useAnimatedStyle(() => {
    const share = shareOf(position.value, index);
    return { opacity: named.value * interpolate(share, [0.6, 1], [0, 1], Extrapolation.CLAMP), transform: [{ translateX: interpolate(share, [0, 1], [-6, 0], Extrapolation.CLAMP) }] };
  });

  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={text} accessibilityState={{ selected: focused }} onPress={onPress}>
      <Animated.View style={[styles.tab, tab]}>
        <View style={styles.icon}>
          <Animated.View style={[StyleSheet.absoluteFill, onGlass]}>
            <Icon color={palette.chrome} size={iconSize} strokeWidth={1.75} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, onPill]}>
            <Icon color={ink} size={iconSize} strokeWidth={2.25} />
          </Animated.View>
        </View>
        <Animated.Text numberOfLines={1} style={[label, styles.label, name]}>
          {text}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const inner = tabBarHeight - pad * 2;
const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  bar: { height: tabBarHeight, borderRadius: tabBarHeight / 2, flexDirection: "row", alignItems: "center", gap, padding: pad },
  pill: { position: "absolute", top: pad, left: 0, height: inner, borderRadius: inner / 2 },
  tab: { height: inner, flexDirection: "row", alignItems: "center", gap: space.sm, overflow: "hidden" },
  icon: { width: iconSize, height: iconSize },
  label: { fontSize: 10.5, color: ink },
});
