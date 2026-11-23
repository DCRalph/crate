import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pause, Play, SkipBack, SkipForward, X, type LucideIcon } from "lucide-react-native";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass, GlassButton } from "@/components/glass";
import { Cover, Key, Lamp, Note } from "@/components/ui";
import { Waveform } from "@/components/waveform";
import { count, formatDuration } from "@/lib/format";
import { coverSource } from "@/lib/media";
import { useCurrentTrack, usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { band, deck, font, ink, label, lamp } from "@/lib/theme";

/** A round key of the transport, drawn on the panel's glass. */
function Round({ icon: Icon, name, onPress, disabled }: { icon: LucideIcon; name: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} disabled={disabled} hitSlop={6} onPress={onPress} style={({ pressed }) => [styles.round, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}>
      <Icon size={20} color={deck.chrome} fill={deck.chrome} />
    </Pressable>
  );
}

/**
 * Now playing, as one page that scrolls: the cover edge to edge, the name and
 * artist as a strip under it, the waveform and transport on a panel of night
 * glass, then the queue. The same cover, out of focus, lights the page from
 * behind and stays put, and a glass Close stays on the corner. Being a single
 * scroller, pulling down at the top is the sheet's own way of closing.
 */
export default function NowPlaying() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const server = useActiveServer();
  const track = useCurrentTrack();
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const playing = usePlayer((state) => state.playing);
  const loading = usePlayer((state) => state.loading);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const { toggle, next, previous, seek, jump } = usePlayer.getState();

  if (!track) {
    return (
      <View style={{ flex: 1, backgroundColor: deck.strip, padding: 20, paddingTop: insets.top + 20, gap: 12 }}>
        <Note onPrint>Nothing on the deck.</Note>
        <Key label="Close" onPress={() => router.back()} />
      </View>
    );
  }

  const top = (
    <>
      {/* Never so tall on a short phone that the transport is pushed off the screen. */}
      <Cover type="album" id={track.albumId} size={800} style={{ aspectRatio: undefined, width: "100%", height: Math.min(width, height * 0.42) }} />
      <Text numberOfLines={1} style={[label, { backgroundColor: deck.strip, color: ink, fontSize: 13.5, lineHeight: 36, paddingHorizontal: 16, opacity: loading ? 0.55 : 1 }]}>
        {track.title}
      </Text>
      <Text numberOfLines={1} style={{ backgroundColor: band, color: ink, fontFamily: font.medium, fontSize: 12.5, lineHeight: 24, paddingHorizontal: 16 }}>
        {track.artistName}
      </Text>

      <Glass night style={styles.panel}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={[styles.time, { textAlign: "right" }]}>{formatDuration(position)}</Text>
          <Waveform trackId={track.id} position={position} duration={duration} color={deck.chrome} onSeek={seek} />
          <Text style={styles.time}>{formatDuration(duration)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 22 }}>
          <Round icon={SkipBack} name="Previous" onPress={previous} />
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause" : "Play"} hitSlop={6} onPress={toggle} style={({ pressed }) => [styles.play, { opacity: pressed ? 0.8 : 1 }]}>
            {playing ? <Pause size={26} color={ink} fill={ink} /> : <Play size={26} color={ink} fill={ink} style={{ marginLeft: 3 }} />}
          </Pressable>
          <Round icon={SkipForward} name="Next" disabled={index >= queue.length - 1} onPress={next} />
        </View>
      </Glass>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <Text style={[label, { color: deck.chrome, fontSize: 11 }]}>Queue</Text>
        <Text style={{ fontFamily: font.body, fontSize: 12.5, color: deck.chrome2 }}>{count(queue.length, "track")}</Text>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: deck.cab }}>
      {server ? <Image source={coverSource(server, "album", track.albumId, 160)} blurRadius={30} contentFit="cover" cachePolicy="disk" style={StyleSheet.absoluteFill} /> : null}
      {/* Petrol over the blur, so the queue and its type read the same over any cover. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(14,43,47,0.62)" }]} />

      <FlatList
        data={queue}
        keyExtractor={(item, position) => `${item.id}-${position}`}
        ListHeaderComponent={top}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        renderItem={({ item, index: position }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${item.title}`}
            onPress={() => jump(position)}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: pressed ? "rgba(227,235,232,0.08)" : "transparent" })}
          >
            <Lamp lit={position === index && playing} on="night" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 14.5, color: position === index ? lamp : deck.chrome }}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: deck.chrome2 }}>
                {item.artistName}
              </Text>
            </View>
            <Text style={{ fontFamily: font.body, fontSize: 12.5, color: deck.chrome2, fontVariant: ["tabular-nums"] }}>{formatDuration(item.duration)}</Text>
          </Pressable>
        )}
      />

      <View style={{ position: "absolute", top: 12, right: 12 }}>
        <GlassButton night label="Close" icon={X} size={38} onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { margin: 12, borderRadius: 24, padding: 14, gap: 12 },
  time: { fontFamily: font.body, fontSize: 12, color: deck.chrome2, width: 34, fontVariant: ["tabular-nums"] },
  round: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(227,235,232,0.1)", alignItems: "center", justifyContent: "center" },
  play: { width: 66, height: 66, borderRadius: 33, backgroundColor: band, alignItems: "center", justifyContent: "center" },
});
