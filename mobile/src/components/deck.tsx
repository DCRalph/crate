import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { Pause, Play, SkipForward } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCurrentTrack, usePlayer } from "@/lib/player";
import { lamp, space } from "@/lib/theme";
import { deckHeight, deckOffset, floatSpring } from "./bottom";
import { Glass } from "./glass";
import { BottomFade } from "./screen-header";
import { Cover, Key, Strip } from "./ui";

/** The round cover on the deck and the ring of light round it. */
const coverSize = 42;

/**
 * The deck: a capsule of night glass floating over every page of the library
 * while something is on it, above the tabs where there are tabs and in their
 * place where there aren't. The cover sits in a ring that is amber while it
 * plays, as what is playing is everywhere, then its title strip, the coral Play key and the
 * Next key, with the lamp's line of progress under them. Touching the cover
 * or the strip opens Now playing. It sits back a little while a track is on
 * its way.
 */
export function Deck() {
  const router = useRouter();
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
      <Animated.View pointerEvents="box-none" style={[styles.wrap, lifted]}>
        <Glass night interactive style={styles.capsule}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Now playing: ${track.title}, ${track.artistName}`} onPress={() => router.push("/now-playing")} style={[styles.open, { opacity: loading ? 0.6 : 1 }]}>
            <View style={[styles.ring, playing && styles.lit]}>
              <Cover type="album" id={track.albumId} size={160} style={styles.cover} />
            </View>
            <Strip title={track.title} band={track.artistName} style={styles.strip} />
          </Pressable>
          <Key tone="brand" icon={playing ? Pause : Play} fill name={playing ? "Pause" : "Play"} onPress={usePlayer.getState().toggle} style={styles.key} />
          <Key icon={SkipForward} fill name="Next" disabled={!hasNext} onPress={usePlayer.getState().next} style={styles.key} />
          {/* Kept to the flat of the capsule, clear of its round ends. */}
          <View pointerEvents="none" style={styles.track}>
            <View style={[styles.played, { width: `${played * 100}%` }]} />
          </View>
        </Glass>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: space.md, right: space.md, bottom: 0 },
  capsule: { height: deckHeight, borderRadius: deckHeight / 2, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 7, paddingRight: 9 },
  open: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  ring: { width: coverSize + 4, height: coverSize + 4, borderRadius: (coverSize + 4) / 2, borderWidth: 2, borderColor: "rgba(227,235,232,0.18)", alignItems: "center", justifyContent: "center" },
  lit: { borderColor: lamp, shadowColor: lamp, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  cover: { width: coverSize - 2, borderRadius: (coverSize - 2) / 2 },
  strip: { flex: 1, minWidth: 0, borderRadius: 3, overflow: "hidden" },
  key: { width: 42, height: 38, paddingHorizontal: 0 },
  track: { position: "absolute", left: 64, right: 28, bottom: 3, height: 2, borderRadius: 1, backgroundColor: "rgba(227,235,232,0.16)" },
  played: { height: 2, borderRadius: 1, backgroundColor: lamp },
});
