import { useRouter } from "expo-router";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react-native";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Cover, Key, Lamp, Note } from "@/components/ui";
import { Waveform } from "@/components/waveform";
import { count, formatDuration } from "@/lib/format";
import { useCurrentTrack, usePlayer } from "@/lib/player";
import { band, font, ink, ink2, label, usePalette } from "@/lib/theme";

/**
 * Now playing, as on the website's phone layout: the cover edge to edge with
 * the close key on its corner, the name and artist as a strip under it, the
 * track as a waveform to move through, the transport, and the queue. Print
 * throughout.
 */
export default function NowPlaying() {
  const router = useRouter();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const track = useCurrentTrack();
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const playing = usePlayer((state) => state.playing);
  const loading = usePlayer((state) => state.loading);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const { toggle, next, previous, seek, jump } = usePlayer.getState();

  return (
    <View style={{ flex: 1, backgroundColor: palette.strip }}>
      {track ? (
        <>
          <View>
            {/* Edge to edge, and never so tall on a short phone that the queue is pushed off the screen. */}
            <Cover type="album" id={track.albumId} size={800} style={{ aspectRatio: undefined, width: "100%", height: Math.min(width, height * 0.46) }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => router.back()} style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: 6, backgroundColor: palette.strip, alignItems: "center", justifyContent: "center" }}>
              <X size={18} color={ink} />
            </Pressable>
          </View>
          <Text numberOfLines={1} style={[label, { color: ink, fontSize: 13.5, lineHeight: 36, paddingHorizontal: 16, opacity: loading ? 0.55 : 1 }]}>
            {track.title}
          </Text>
          <Text numberOfLines={1} style={{ backgroundColor: band, color: ink, fontFamily: font.medium, fontSize: 12.5, lineHeight: 24, paddingHorizontal: 16 }}>
            {track.artistName}
          </Text>

          <View style={{ padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: palette.stripLine }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontFamily: font.body, fontSize: 12, color: ink2, width: 34, textAlign: "right", fontVariant: ["tabular-nums"] }}>{formatDuration(position)}</Text>
              <Waveform trackId={track.id} position={position} duration={duration} color={ink} onSeek={seek} />
              <Text style={{ fontFamily: font.body, fontSize: 12, color: ink2, width: 34, fontVariant: ["tabular-nums"] }}>{formatDuration(duration)}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <Key icon={SkipBack} fill name="Previous" onPress={previous} style={{ width: 52, height: 46, backgroundColor: ink }} color={palette.strip} />
              <Key tone="brand" icon={playing ? Pause : Play} fill name={playing ? "Pause" : "Play"} onPress={toggle} style={{ width: 76, height: 50 }} />
              <Key icon={SkipForward} fill name="Next" disabled={index >= queue.length - 1} onPress={next} style={{ width: 52, height: 46, backgroundColor: ink }} color={palette.strip} />
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.stripLine }}>
            <Text style={[label, { color: ink, fontSize: 11 }]}>Queue</Text>
            <Text style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>{count(queue.length, "track")}</Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}>
            {queue.map((item, i) => (
              <Pressable
                key={`${item.id}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}
                onPress={() => jump(i)}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 7, backgroundColor: pressed ? palette.strip2 : "transparent" })}
              >
                <Lamp lit={i === index && playing} onPrint />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 14.5, color: i === index ? "#b93a17" : ink }}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>
                    {item.artistName}
                  </Text>
                </View>
                <Text style={{ fontFamily: font.body, fontSize: 12.5, color: ink2, fontVariant: ["tabular-nums"] }}>{formatDuration(item.duration)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : (
        <View style={{ padding: 20, paddingTop: insets.top + 20, gap: 12 }}>
          <Note onPrint>Nothing on the deck.</Note>
          <Key label="Close" onPress={() => router.back()} />
        </View>
      )}
    </View>
  );
}
