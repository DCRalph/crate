import type { ReactNode } from "react";
import { Image } from "expo-image";
import { Pause, Play } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import type { Track } from "@/lib/api";
import { coverSource } from "@/lib/media";
import { usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { band, font, ink, space, usePalette } from "@/lib/theme";
import { Fade } from "./screen-header";
import { Card, Key } from "./ui";

/**
 * The cover again, out of focus, behind the top of an album or playlist page:
 * the page takes the record's colour, and the glass of the bar has something
 * to bend. It is the first thing in the page's scroller and leaves with it.
 */
export function Backdrop({ type, id, version }: { type: "album" | "playlist"; id: number; version?: string }) {
  const server = useActiveServer();
  const palette = usePalette();
  if (!server) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380 }}>
      <Image source={coverSource(server, type, id, 160, version)} blurRadius={24} contentFit="cover" cachePolicy="disk" style={StyleSheet.absoluteFill} />
      <Fade from={palette.cab} up style={{ bottom: 0, height: 240 }} />
    </View>
  );
}

/**
 * The top of an album or playlist page, as a printed card: the cover at the
 * side with the Play key on its corner, the name lettered large, the facts on
 * the coral band, and any other keys under them. The Play key reads Pause
 * while this is what is playing.
 */
export function Hero({ cover, title, facts, from, tracks, children }: { cover: ReactNode; title: string; facts: string[]; from: string; tracks: Track[]; children?: ReactNode }) {
  const server = useActiveServer();
  const mine = usePlayer((state) => state.from === from && state.serverId === server?.id && state.queue.length > 0);
  const sounding = usePlayer((state) => state.playing) && mine;
  return (
    <Card style={{ flexDirection: "row", gap: 14, padding: 14 }}>
      <View style={{ width: 120 }}>
        {cover}
        <Key
          tone="brand"
          icon={sounding ? Pause : Play}
          fill
          name={sounding ? "Pause" : "Play"}
          disabled={!tracks.length}
          onPress={() => (mine ? usePlayer.getState().toggle() : server && usePlayer.getState().play(server, tracks, 0, from))}
          style={{ position: "absolute", right: 6, bottom: 6, width: 48 }}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
        <Text numberOfLines={3} style={{ fontFamily: font.title, fontSize: 26, lineHeight: 27, color: ink, textTransform: "uppercase" }}>
          {title}
        </Text>
        <View style={{ backgroundColor: band, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3, flexDirection: "row", flexWrap: "wrap", columnGap: 12 }}>
          {facts.map((fact) => (
            <Text key={fact} style={{ fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, color: ink }}>
              {fact}
            </Text>
          ))}
        </View>
        {children ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: "auto" }}>{children}</View> : null}
      </View>
    </Card>
  );
}
