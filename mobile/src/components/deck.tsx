import { useRouter } from "expo-router";
import { ListMusic, Pause, Play, SkipForward } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useCurrentTrack, usePlayer } from "@/lib/player";
import { band, deck, font, ink, label, lamp, radius } from "@/lib/theme";
import { Key } from "./ui";

/**
 * The deck: a slim bar over the tabs while something is on it. The track is a
 * title strip, name on ivory and artist on the band; touching it opens Now
 * playing. The strip sits back a little while a track is on its way. Always
 * the night cabinet, so the lamp reads the same at any hour.
 */
export function Deck() {
  const router = useRouter();
  const track = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const loading = usePlayer((state) => state.loading);
  const played = usePlayer((state) => (state.duration ? Math.min(state.position / state.duration, 1) : 0));
  const hasNext = usePlayer((state) => state.index < state.queue.length - 1);
  if (!track) return null;

  return (
    <View style={{ backgroundColor: deck.cab2, borderTopWidth: 1, borderTopColor: deck.line }}>
      <View style={{ height: 2, backgroundColor: deck.cab3 }}>
        <View style={{ height: 2, width: `${played * 100}%`, backgroundColor: lamp }} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Now playing: ${track.title}, ${track.artistName}`} onPress={() => router.push("/now-playing")} style={{ flex: 1, borderRadius: radius.sm, overflow: "hidden", opacity: loading ? 0.6 : 1 }}>
          <Text numberOfLines={1} style={[label, { backgroundColor: deck.strip, color: ink, fontSize: 12, lineHeight: 24, paddingHorizontal: 8 }]}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={{ backgroundColor: band, color: ink, fontFamily: font.medium, fontSize: 12, lineHeight: 20, paddingHorizontal: 8 }}>
            {track.artistName}
          </Text>
        </Pressable>
        <Key tone="brand" icon={playing ? Pause : Play} fill name={playing ? "Pause" : "Play"} onPress={usePlayer.getState().toggle} style={{ width: 50 }} />
        <Key icon={SkipForward} fill name="Next" disabled={!hasNext} onPress={usePlayer.getState().next} />
        <Key tone="ghost" icon={ListMusic} name="Queue" color={deck.chrome2} onPress={() => router.push("/now-playing")} />
      </View>
    </View>
  );
}
