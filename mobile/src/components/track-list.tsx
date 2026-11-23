import { ArrowDownToLine } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Track } from "@/lib/api";
import { useDownloads } from "@/lib/downloads";
import { formatDuration, rowNumber } from "@/lib/format";
import { useCurrentTrack, usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { font, ink, ink2, label, usePalette } from "@/lib/theme";
import { showTrackMenu } from "./track-menu";
import { Card, Cover, Lamp } from "./ui";
import { Waveform } from "./waveform";

/** Width of the first column: the lamp and the row's number. */
const numberWidth = 40;

/**
 * The playing row's waveform, under its title: the played part solid, and a
 * finger along it moves through the track. On a phone there is no room for a
 * waveform on every row beside the title, so only the one that is on opens up.
 */
function RowWave() {
  const track = useCurrentTrack();
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  return (
    <View style={styles.wave}>
      <Text style={styles.time}>{formatDuration(position)}</Text>
      <Waveform trackId={track?.id} position={position} duration={duration} color={ink} height={26} onSeek={usePlayer.getState().seek} />
      <Text style={[styles.time, { textAlign: "right" }]}>{formatDuration(duration)}</Text>
    </View>
  );
}

/**
 * A list of tracks, printed as a card under a coral heading. Every row has a
 * number and a lamp, lit on the row that is playing, which opens to show its
 * waveform (`RowWave`). A touch plays the list from that row; a long press
 * offers the queue and a playlist (`showTrackMenu`). A small arrow marks a
 * track that is downloaded to the phone.
 *  - `showCover`: each track's album cover, for lists that mix albums.
 *  - `plays`: how often each was played, in a column of its own (Most played).
 *  - `from`: names the list for the queue ("album:12"), so its Play key knows it is what is playing.
 */
export function TrackList({ tracks, showCover = false, plays, from }: { tracks: Track[]; showCover?: boolean; plays?: Record<number, number>; from?: string }) {
  const palette = usePalette();
  const router = useRouter();
  const server = useActiveServer();
  const current = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const shelf = useDownloads((state) => (server ? state.shelves[server.id] : undefined));

  return (
    <Card>
      <View style={[styles.head, { backgroundColor: palette.band }]}>
        <Text style={[label, styles.heading, { width: numberWidth - 10 }]}>No.</Text>
        <Text style={[label, styles.heading, { flex: 1 }]}>Title</Text>
        {plays ? <Text style={[label, styles.heading, { width: 52, textAlign: "right" }]}>Plays</Text> : null}
        <Text style={[label, styles.heading, { width: 40, textAlign: "right" }]}>Time</Text>
      </View>
      {tracks.map((track, index) => {
        const isCurrent = current?.id === track.id;
        return (
          <Pressable
            key={`${track.id}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`Play ${track.title}, ${track.artistName}`}
            onPress={() => server && usePlayer.getState().play(server, tracks, index, from)}
            onLongPress={() => server && showTrackMenu({ server, track, router })}
            style={({ pressed }) => [styles.row, { borderTopWidth: index ? 1 : 0, borderTopColor: palette.stripLine, backgroundColor: isCurrent || pressed ? palette.strip2 : "transparent" }]}
          >
            <View style={styles.line}>
              <View style={styles.number}>
                <Lamp lit={isCurrent && playing} on="print" />
                <Text style={[styles.numberText, { color: isCurrent ? ink : ink2 }]}>{rowNumber(index)}</Text>
              </View>
              {showCover ? <Cover type="album" id={track.albumId} size={96} style={styles.cover} /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: isCurrent ? font.semi : font.medium, fontSize: 15, color: ink }}>
                  {track.title}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>
                  {track.artistName}
                </Text>
              </View>
              {shelf?.tracks[track.id]?.state === "downloaded" ? <ArrowDownToLine size={14} color={ink2} /> : null}
              {plays ? <Text style={[styles.figure, { width: 52, fontFamily: font.num, fontSize: 15 }]}>{(plays[track.id] ?? 0).toLocaleString()}</Text> : null}
              {/* The playing row's length is at the end of its waveform. */}
              <Text style={[styles.figure, { width: 40 }]}>{isCurrent ? "" : formatDuration(track.duration)}</Text>
            </View>
            {isCurrent ? <RowWave /> : null}
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10, height: 30, paddingHorizontal: 12 },
  heading: { color: ink, fontSize: 11 },
  row: { paddingHorizontal: 12, paddingVertical: 7 },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
  number: { flexDirection: "row", alignItems: "center", gap: 7, width: numberWidth - 10 },
  numberText: { fontFamily: font.num, fontSize: 15 },
  cover: { width: 34, borderRadius: 3 },
  figure: { fontFamily: font.body, fontSize: 13.5, color: ink2, fontVariant: ["tabular-nums"], textAlign: "right" },
  wave: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: numberWidth, paddingTop: 6, paddingBottom: 1 },
  time: { fontFamily: font.body, fontSize: 11, color: ink2, width: 30, fontVariant: ["tabular-nums"] },
});
