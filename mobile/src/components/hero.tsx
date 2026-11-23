import type { ReactNode } from "react";
import { Pause, Play } from "lucide-react-native";
import { Text, View } from "react-native";

import type { Track } from "@/lib/api";
import { usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { band, font, ink, space } from "@/lib/theme";
import { Card, Key } from "./ui";

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
