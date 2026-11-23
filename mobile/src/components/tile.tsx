import { useRouter } from "expo-router";
import { Pin } from "lucide-react-native";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import type { Album, Playlist } from "@/lib/api";
import { count } from "@/lib/format";
import { useCurrentTrack, usePlayer } from "@/lib/player";
import { lamp } from "@/lib/theme";
import { LitCover } from "./lit-cover";
import { Plate, Strip } from "./ui";

/**
 * A tile on the glass: the cover lit in its own colours, its title strip, and
 * its selection code on a plate in the corner ("B3"), as on the website. The
 * one playing has the amber ring and its code in amber.
 */
function Tile({ name, cover, band, code, lit, pinned, onPress, style }: { name: string; cover: Parameters<typeof LitCover>[0]["cover"]; band: string; code?: string; lit: boolean; pinned?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={code ? `${name}, ${band}, selection ${code}` : `${name}, ${band}`} onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }, style]}>
      <LitCover cover={cover} size={400} lit={lit}>
        <Strip title={name} band={band} />
      </LitCover>
      {code ? (
        <Plate style={styles.code} color={lit ? lamp : undefined}>
          {code}
        </Plate>
      ) : null}
      {pinned ? (
        <Plate style={styles.pin}>
          <Pin size={12} color={lamp} fill={lamp} />
        </Plate>
      ) : null}
    </Pressable>
  );
}

/** An album as a tile. Opens the album. */
export function AlbumTile({ album, code, style }: { album: Pick<Album, "id" | "name" | "artistName" | "year">; code?: string; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const lit = useCurrentTrack()?.albumId === album.id;
  return <Tile name={album.name} cover={{ type: "album", id: album.id }} band={[album.artistName, album.year].filter(Boolean).join(" · ")} code={code} lit={lit} onPress={() => router.push(`/album/${album.id}`)} style={style} />;
}

/** A playlist as a tile. A pinned one carries its pin on a plate. */
export function PlaylistTile({ playlist, code, style }: { playlist: Pick<Playlist, "id" | "name" | "coverKey" | "trackCount" | "pinnedAt">; code?: string; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const lit = usePlayer((state) => state.from === `playlist:${playlist.id}` && state.queue.length > 0);
  return (
    <Tile
      name={playlist.name}
      cover={{ type: "playlist", id: playlist.id, version: playlist.coverKey }}
      band={count(playlist.trackCount, "track")}
      code={code}
      lit={lit}
      pinned={!!playlist.pinnedAt}
      onPress={() => router.push(`/playlist/${playlist.id}`)}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  code: { position: "absolute", top: 6, left: 6 },
  pin: { position: "absolute", top: 6, right: 6, paddingVertical: 4 },
});

/** The letters rows of tiles take, in order, as on the website, which leaves out the letters its keyboard shortcuts use. */
export const rowLetters = ["A", "B", "C", "D", "E", "G", "H", "J", "K"] as const;
