import type { ReactNode } from "react";
import { Image } from "expo-image";
import { Pause, Play, Shuffle } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import type { Track } from "@/lib/api";
import { coverSource } from "@/lib/media";
import { usePlayer } from "@/lib/player";
import { useActiveServer } from "@/lib/servers";
import { deck, font, glass, label, space } from "@/lib/theme";
import { LitCover } from "./lit-cover";
import { Fade } from "./screen-header";
import { Key } from "./ui";

/**
 * The cover again, out of focus, behind the top of an album or playlist page:
 * the glass takes a little of the record's colour, and the bar has something
 * to bend. It is the first thing in the page's scroller and leaves with it.
 */
export function Backdrop({ type, id, version }: { type: "album" | "playlist"; id: number; version?: string }) {
  const server = useActiveServer();
  if (!server) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380, opacity: 0.45 }}>
      <Image source={coverSource(server, type, id, 160, version)} blurRadius={30} contentFit="cover" cachePolicy="disk" style={StyleSheet.absoluteFill} />
      <Fade from={glass} up style={{ bottom: 0, height: 260 }} />
    </View>
  );
}

/**
 * The top of an album or playlist page, on the glass: the cover lit in its
 * own colours (in the amber ring while this is what is playing), what it is
 * in small capitals, its name lettered large, who it is by and its facts.
 * Under them the keys: Play (Pause while this is playing), Shuffle, and any
 * of the page's own (`children`).
 */
export function Hero({ cover, kind, title, by, facts, from, tracks, children }: { cover: Parameters<typeof LitCover>[0]["cover"]; kind: string; title: string; by?: string; facts: string[]; from: string; tracks: Track[]; children?: ReactNode }) {
  const server = useActiveServer();
  const mine = usePlayer((state) => state.from === from && state.serverId === server?.id && state.queue.length > 0);
  const sounding = usePlayer((state) => state.playing) && mine;
  const { play, toggle, toggleShuffle } = usePlayer.getState();

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.top}>
        <LitCover cover={cover} size={400} lit={mine} at="around" style={styles.cover} />
        <View style={styles.words}>
          <Text style={[label, styles.kind]}>{kind}</Text>
          <Text accessibilityRole="header" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.title}>
            {title}
          </Text>
          {by ? (
            <Text numberOfLines={1} style={styles.by}>
              {by}
            </Text>
          ) : null}
          <Text numberOfLines={2} style={styles.facts}>
            {facts.join(" · ")}
          </Text>
        </View>
      </View>
      <View style={styles.keys}>
        <Key tone="brand" icon={sounding ? Pause : Play} fill label={sounding ? "Pause" : "Play"} disabled={!tracks.length} onPress={() => (mine ? toggle() : server && play(server, tracks, 0, from))} />
        <Key
          icon={Shuffle}
          name="Shuffle"
          disabled={tracks.length < 2}
          onPress={() => {
            if (!server) return;
            // Any track first, then the rest mixed after it.
            play(server, tracks, Math.floor(Math.random() * tracks.length), from);
            toggleShuffle();
          }}
        />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  cover: { width: 128 },
  words: { flex: 1, minWidth: 0, gap: 3 },
  kind: { color: deck.chrome2, fontSize: 10.5 },
  title: { fontFamily: font.num, fontSize: 32, lineHeight: 32, color: deck.chrome, textTransform: "uppercase", marginTop: 2 },
  by: { fontFamily: font.medium, fontSize: 15, color: deck.chrome },
  facts: { fontFamily: font.body, fontSize: 12.5, color: deck.chrome2 },
  keys: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
