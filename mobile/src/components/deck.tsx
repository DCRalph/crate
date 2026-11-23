import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { Pause, Play, SkipForward } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCurrentTrack, usePlayer } from "@/lib/player";
import { deck, font, ink, label, lamp, space, usePalette } from "@/lib/theme";
import { deckHeight, deckOffset, floatSpring } from "./bottom";
import { Glass } from "./glass";
import { BottomFade } from "./screen-header";
import { Cover } from "./ui";

/**
 * The deck: a glass capsule floating over every page of the library while
 * something is on it, above the tabs where there are tabs and in their place
 * where there aren't. The cover turns up as a record label, then the name and
 * artist, the coral Play key and Next, with the lamp's line of progress under
 * them. Touching it opens Now playing. Always night glass, so the lamp reads
 * the same at any hour. It sits back a little while a track is on its way.
 */
export function Deck() {
  const router = useRouter();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [section] = useSegments();
  const track = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const loading = usePlayer((state) => state.loading);
  const played = usePlayer((state) => (state.duration ? Math.min(state.position / state.duration, 1) : 0));
  const hasNext = usePlayer((state) => state.index < state.queue.length - 1);

  const onTabs = section === "(tabs)";
  const offset = deckOffset(insets.bottom, onTabs);
  const lift = useSharedValue(offset);
  useEffect(() => {
    lift.value = withSpring(offset, floatSpring);
  }, [lift, offset]);
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: -lift.value }] }));

  // Settings and the servers are about the phone, not the music.
  if (!track || section === "settings" || section === "servers") return null;

  return (
    <>
      {onTabs ? null : <BottomFade height={offset + deckHeight + space.xl} />}
      <Animated.View pointerEvents="box-none" style={[{ position: "absolute", left: space.md, right: space.md, bottom: 0 }, lifted]}>
        <Glass night interactive style={{ height: deckHeight, borderRadius: deckHeight / 2, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 7, paddingRight: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Now playing: ${track.title}, ${track.artistName}`} onPress={() => router.push("/now-playing")} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, opacity: loading ? 0.6 : 1 }}>
            <Cover type="album" id={track.albumId} size={160} style={{ width: 44, borderRadius: 22 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[label, { color: deck.chrome, fontSize: 12 }]}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 12.5, color: deck.chrome2 }}>
                {track.artistName}
              </Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"} hitSlop={6} onPress={usePlayer.getState().toggle} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: palette.band, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
            {playing ? <Pause size={18} color={ink} fill={ink} /> : <Play size={18} color={ink} fill={ink} style={{ marginLeft: 2 }} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next" hitSlop={6} disabled={!hasNext} onPress={usePlayer.getState().next} style={({ pressed }) => ({ width: 38, height: 42, alignItems: "center", justifyContent: "center", opacity: !hasNext ? 0.35 : pressed ? 0.6 : 1 })}>
            <SkipForward size={19} color={deck.chrome} fill={deck.chrome} />
          </Pressable>
          {/* Kept to the flat of the capsule, clear of its round ends. */}
          <View pointerEvents="none" style={{ position: "absolute", left: 61, right: 30, bottom: 4, height: 2, borderRadius: 1, backgroundColor: "rgba(227,235,232,0.16)" }}>
            <View style={{ height: 2, borderRadius: 1, width: `${played * 100}%`, backgroundColor: lamp }} />
          </View>
        </Glass>
      </Animated.View>
    </>
  );
}
