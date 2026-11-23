import { useRouter } from "expo-router";
import { Pin } from "lucide-react-native";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import type { Album, Playlist } from "@/lib/api";
import { count } from "@/lib/format";
import { lamp, radius } from "@/lib/theme";
import { Cover, Plate, Strip } from "./ui";

/** An album as a cover tile with its title strip, as on the website. Opens the album. */
export function AlbumTile({ album, style }: { album: Pick<Album, "id" | "name" | "artistName" | "year">; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${album.name}, ${album.artistName}`} onPress={() => router.push(`/album/${album.id}`)} style={({ pressed }) => [{ borderRadius: radius.sm, overflow: "hidden", opacity: pressed ? 0.85 : 1 }, style]}>
      <Cover type="album" id={album.id} size={400} />
      <Strip title={album.name} band={[album.artistName, album.year].filter(Boolean).join(" · ")} />
    </Pressable>
  );
}

/** A playlist as a cover tile. A pinned one carries its pin on a plate. */
export function PlaylistTile({ playlist, style }: { playlist: Pick<Playlist, "id" | "name" | "coverKey" | "trackCount" | "pinnedAt">; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={playlist.name} onPress={() => router.push(`/playlist/${playlist.id}`)} style={({ pressed }) => [{ borderRadius: radius.sm, overflow: "hidden", opacity: pressed ? 0.85 : 1 }, style]}>
      <View>
        <Cover type="playlist" id={playlist.id} size={400} version={playlist.coverKey} />
        {playlist.pinnedAt ? (
          <Plate style={{ position: "absolute", top: 6, right: 6, paddingVertical: 4 }}>
            <Pin size={12} color={lamp} fill={lamp} />
          </Plate>
        ) : null}
      </View>
      <Strip title={playlist.name} band={count(playlist.trackCount, "track")} />
    </Pressable>
  );
}
