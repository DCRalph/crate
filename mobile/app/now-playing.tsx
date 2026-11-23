import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Heart, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, X, type LucideIcon } from "lucide-react-native";
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassButton } from "@/components/glass";
import { LitCover } from "@/components/lit-cover";
import { GlassGround } from "@/components/screen";
import { showTrackMenu } from "@/components/track-menu";
import { Inset, Key, Lamp, Note, Segments } from "@/components/ui";
import { Waveform } from "@/components/waveform";
import { useTRPC, type Track } from "@/lib/api";
import { count, formatDuration } from "@/lib/format";
import { useCurrentTrack, usePlayer, type Repeat as RepeatMode } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { useSettings } from "@/lib/settings";
import { deck, font, glassLine, GroundContext, label, lamp } from "@/lib/theme";

/** A sign at the edge of the transport that is either on or off: shuffle, repeat. On is the lamp's amber. */
function Mode({ icon: Icon, name, on, onPress }: { icon: LucideIcon; name: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: on }} hitSlop={10} onPress={onPress} style={({ pressed }) => [styles.mode, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon size={20} color={on ? lamp : deck.chrome2} />
    </Pressable>
  );
}

/** Repeat goes round: off, the whole queue, the one track. */
const afterRepeat: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
const repeatNames: Record<RepeatMode, string> = { off: "Repeat, off", all: "Repeat, the queue", one: "Repeat, this track" };

const modes = [
  { value: "detailed", label: "Detailed" },
  { value: "minimal", label: "Minimal" },
] as const;

/** Previous, the coral Play key and Next, as keys. Detailed puts shuffle and repeat at its ends. */
function Transport({ withModes }: { withModes: boolean }) {
  const playing = usePlayer((state) => state.playing);
  const canNext = usePlayer((state) => state.index < state.queue.length - 1 || (state.repeat === "all" && state.queue.length > 1));
  const repeat = usePlayer((state) => state.repeat);
  const isShuffled = usePlayer((state) => state.unshuffled !== null);
  const { toggle, next, previous, setRepeat, toggleShuffle } = usePlayer.getState();
  return (
    <View style={[styles.transport, !withModes && { justifyContent: "center", gap: 18 }]}>
      {withModes ? <Mode icon={Shuffle} name="Shuffle" on={isShuffled} onPress={toggleShuffle} /> : null}
      <Key icon={SkipBack} fill name="Previous" iconSize={20} onPress={previous} style={styles.side} />
      <Key tone="brand" icon={playing ? Pause : Play} fill name={playing ? "Pause" : "Play"} iconSize={26} onPress={toggle} style={styles.play} />
      <Key icon={SkipForward} fill name="Next" iconSize={20} disabled={!canNext} onPress={next} style={styles.side} />
      {withModes ? <Mode icon={repeat === "one" ? Repeat1 : Repeat} name={repeatNames[repeat]} on={repeat !== "off"} onPress={() => setRepeat(afterRepeat[repeat])} /> : null}
    </View>
  );
}

/** Where the track is, as its waveform with the time either side. A finger along it moves through the track. */
function Seek({ track, bare }: { track: Track; bare: boolean }) {
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const row = (
    <>
      <Text style={styles.time}>{formatDuration(position)}</Text>
      <Waveform trackId={track.id} position={position} duration={duration} color={deck.chrome} height={bare ? 44 : 36} onSeek={usePlayer.getState().seek} />
      <Text style={[styles.time, { textAlign: "right" }]}>{formatDuration(duration)}</Text>
    </>
  );
  return bare ? <View style={styles.seek}>{row}</View> : <Inset style={[styles.seek, styles.inset]}>{row}</Inset>;
}

/** Likes changed on this phone since the queue was made, which still carries what the server said then. */
const likedHere = new Map<number, boolean>();

/** The heart: liked or not, kept on the server. It shows the change at once, and goes back if the server says no. */
function Like({ track }: { track: Track }) {
  const trpc = useTRPC();
  const [, redraw] = useState(0);
  const set = (id: number, starred: boolean) => {
    likedHere.set(id, starred);
    redraw((n) => n + 1);
  };
  const star = useMutation(trpc.library.star.mutationOptions({ onError: (_error, input) => set(input.id, !input.starred) }));
  const on = likedHere.get(track.id) ?? track.starred;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? `Unlike ${track.title}` : `Like ${track.title}`}
      accessibilityState={{ selected: on }}
      hitSlop={10}
      onPress={() => {
        set(track.id, !on);
        star.mutate({ type: "track", id: track.id, starred: !on });
      }}
    >
      <Heart size={20} color={on ? lamp : deck.chrome2} fill={on ? lamp : "transparent"} />
    </Pressable>
  );
}

/**
 * Now playing, as on the website, in two layouts that the keys at the top
 * switch between (and that are remembered):
 *  - Detailed: the cover lit in its own colours in the amber ring, the track's
 *    number and album, its name lettered large, the artist and the heart, the
 *    waveform in a window of glass, the keys with shuffle and repeat at their
 *    ends, then the queue. A long press on a row of the queue moves it up next
 *    or takes it out.
 *  - Minimal: the cover, the name, the waveform and three keys, centred.
 *    Nothing fades on a phone: the keys are always there to touch.
 * It is a sheet on the glass, and pulling it down closes it.
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
  const mode = useSettings((state) => state.nowPlaying);

  const bar = (
    <View style={styles.bar}>
      <Segments name="Layout" options={modes} value={mode} onChange={(nowPlaying) => useSettings.getState().change({ nowPlaying })} />
      <GlassButton label="Close" icon={X} size={38} onPress={() => router.back()} />
    </View>
  );

  if (!track) {
    return (
      <GroundContext value="glass">
        <View style={[styles.page, { padding: 20, gap: 12 }]}>
          <GlassGround />
          <Note>Nothing on the deck.</Note>
          <Key label="Close" onPress={() => router.back()} />
        </View>
      </GroundContext>
    );
  }

  const cover = { type: "album", id: track.albumId } as const;

  if (mode === "minimal") {
    // As big as the phone allows, leaving the name, the waveform and the keys on screen.
    const side = Math.min(width - 64, height - 400);
    return (
      <GroundContext value="glass">
        <View style={styles.page}>
          <GlassGround />
          {bar}
          <View style={[styles.minimal, { paddingBottom: insets.bottom + 24 }]}>
            <LitCover cover={cover} size={800} lit={playing} at="around" style={{ width: side, marginBottom: 28 }} />
            <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.title, { textAlign: "center", opacity: loading ? 0.55 : 1 }]}>
              {track.title}
            </Text>
            <Text numberOfLines={1} style={[styles.artist, { textAlign: "center" }]}>
              {track.artistName}
            </Text>
            <View style={{ alignSelf: "stretch", marginVertical: 22 }}>
              <Seek track={track} bare />
            </View>
            <Transport withModes={false} />
          </View>
        </View>
      </GroundContext>
    );
  }

  const top = (
    <View style={styles.detailed}>
      {/* Never so tall on a short phone that the keys are pushed off the screen. */}
      <LitCover cover={cover} size={800} lit={playing} at="around" style={{ width: Math.min(width - 40, height * 0.4), marginBottom: 18 }} />
      <Text numberOfLines={1} style={[label, styles.kind]}>
        {[track.trackNumber ? `Track ${track.trackNumber}` : "", track.albumName].filter(Boolean).join(" · ")}
      </Text>
      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.title, { opacity: loading ? 0.55 : 1 }]}>
        {track.title}
      </Text>
      <View style={styles.byline}>
        <Text numberOfLines={1} style={[styles.artist, { flexShrink: 1 }]}>
          {track.artistName}
        </Text>
        <Like track={track} />
      </View>
      <View style={{ marginTop: 16, marginBottom: 14 }}>
        <Seek track={track} bare={false} />
      </View>
      <Transport withModes />
      <View style={styles.queueHead}>
        <Text style={[label, { color: deck.chrome, fontSize: 11.5 }]}>Queue</Text>
        <Text style={{ fontFamily: font.body, fontSize: 12.5, color: deck.chrome2 }}>{count(queue.length, "track")}</Text>
      </View>
    </View>
  );

  return (
    <GroundContext value="glass">
      <View style={styles.page}>
        <GlassGround />
        {bar}
        <FlatList
          data={queue}
          keyExtractor={(item, position) => `${item.id}-${position}`}
          ListHeaderComponent={top}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          renderItem={({ item, index: position }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.title}`}
              onPress={() => usePlayer.getState().jump(position)}
              onLongPress={() => server && showTrackMenu({ server, track: item, router, queuePosition: position })}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? "rgba(227,235,232,0.08)" : "transparent" }]}
            >
              <Lamp lit={position === index && playing} />
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
      </View>
    </GroundContext>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 },
  // Room above the cover for its light, which the list would otherwise cut off.
  detailed: { paddingHorizontal: 20, paddingTop: 22 },
  minimal: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  kind: { color: deck.chrome2, fontSize: 11 },
  title: { fontFamily: font.num, fontSize: 40, lineHeight: 42, color: deck.chrome, textTransform: "uppercase", marginTop: 4 },
  artist: { fontFamily: font.body, fontSize: 18, color: deck.chrome2 },
  byline: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  seek: { flexDirection: "row", alignItems: "center", gap: 8 },
  inset: { paddingHorizontal: 10, paddingVertical: 6 },
  time: { fontFamily: font.body, fontSize: 12, color: deck.chrome2, width: 34, fontVariant: ["tabular-nums"] },
  transport: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  mode: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  side: { width: 56, height: 46, paddingHorizontal: 0 },
  play: { width: 86, height: 58, paddingHorizontal: 0 },
  queueHead: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: glassLine },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 7 },
});
