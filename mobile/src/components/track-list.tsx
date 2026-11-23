import { ArrowDownToLine } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import type { Track } from "@/lib/api";
import { useDownloads } from "@/lib/downloads";
import { formatDuration, rowNumber } from "@/lib/format";
import { useCurrentTrack, usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { font, ink, ink2, label, usePalette } from "@/lib/theme";
import { showTrackMenu } from "./track-menu";
import { Card, Cover, Lamp } from "./ui";

/**
 * A list of tracks, printed as a card under a coral heading. Every row has a
 * number and a lamp, lit on the row that is playing. A touch plays the list
 * from that row; a long press offers the queue and a playlist (`showTrackMenu`). A small arrow marks a track that is downloaded to the phone.
 *  - `showCover`: each track's album cover, for lists that mix albums.
 *  - `from`: names the list for the queue ("album:12"), so its Play key knows it is what is playing.
 */
export function TrackList({ tracks, showCover = false, from }: { tracks: Track[]; showCover?: boolean; from?: string }) {
  const palette = usePalette();
  const router = useRouter();
  const server = useActiveServer();
  const current = useCurrentTrack();
  const playing = usePlayer((state) => state.playing);
  const shelf = useDownloads((state) => (server ? state.shelves[server.id] : undefined));

  return (
    <Card>
      <View style={{ backgroundColor: palette.band, flexDirection: "row", alignItems: "center", height: 30, paddingHorizontal: 12 }}>
        <Text style={[label, { color: ink, fontSize: 11, width: 46 }]}>No.</Text>
        <Text style={[label, { color: ink, fontSize: 11, flex: 1 }]}>Title</Text>
        <Text style={[label, { color: ink, fontSize: 11 }]}>Time</Text>
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
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderTopWidth: index ? 1 : 0,
              borderTopColor: palette.stripLine,
              backgroundColor: isCurrent || pressed ? palette.strip2 : "transparent",
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, width: 36 }}>
              <Lamp lit={isCurrent && playing} on="print" />
              <Text style={{ fontFamily: font.num, fontSize: 15, color: isCurrent ? ink : ink2 }}>{rowNumber(index)}</Text>
            </View>
            {showCover ? <Cover type="album" id={track.albumId} size={96} style={{ width: 34, borderRadius: 3 }} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: isCurrent ? font.semi : font.medium, fontSize: 15, color: ink }}>
                {track.title}
              </Text>
              <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>
                {track.artistName}
              </Text>
            </View>
            {shelf?.tracks[track.id]?.state === "downloaded" ? <ArrowDownToLine size={14} color={ink2} /> : null}
            <Text style={{ fontFamily: font.body, fontSize: 13.5, color: ink2, fontVariant: ["tabular-nums"] }}>{formatDuration(track.duration)}</Text>
          </Pressable>
        );
      })}
    </Card>
  );
}
