import { useRouter } from "expo-router";
import { Alert, Animated, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/screen";
import { LargeTitle, useScrollHeader } from "@/components/screen-header";
import { Card, Key, Note, SectionHeading } from "@/components/ui";
import { useDownloads } from "@/lib/downloads";
import { count, formatBytes } from "@/lib/format";
import { usePlayer } from "@/lib/player";
import { unpair, useActiveServer, useServers } from "@/lib/servers";
import { band, font, ink, ink2, space, usePalette } from "@/lib/theme";

function Row({ label: text, value, last = false }: { label: string; value: string; last?: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 9, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.stripLine }}>
      <Text style={{ fontFamily: font.body, fontSize: 14.5, color: ink2 }}>{text}</Text>
      <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 14.5, color: ink, flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

/** The server in use and who the phone is paired as, how audio is kept and sent, and the way to other servers. */
export default function Settings() {
  const router = useRouter();
  const palette = usePalette();
  const server = useActiveServer();
  const serverCount = useServers((state) => state.servers.length);
  const sealStreams = useServers((state) => state.sealStreams);
  const shelf = useDownloads((state) => (server ? state.shelves[server.id] : undefined));
  const keptTracks = Object.values(shelf?.tracks ?? {});
  const bytes = keptTracks.reduce((sum, kept) => sum + kept.bytes, 0);
  const { scrollY, scrollProps } = useScrollHeader();
  const insets = useSafeAreaInsets();

  return (
    <Screen scrollY={scrollY} title="Settings" left="back">
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
        <LargeTitle>Settings</LargeTitle>

        {server ? (
          <View>
            <SectionHeading title="This server" />
            <Card style={{ paddingHorizontal: 14 }}>
              <Row label="Server" value={server.name} />
              <Row label="Address" value={server.url.replace(/^https?:\/\//, "")} />
              <Row label="Signed in as" value={server.user.username} last />
            </Card>
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
              <Key label={serverCount > 1 ? `Servers (${serverCount})` : "Servers"} onPress={() => router.push("/servers")} />
              <Key
                label="Sign out"
                onPress={() =>
                  Alert.alert(`Sign out of ${server.name}?`, "This phone's access is removed from the server, and everything kept from it is removed from the phone.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Sign out",
                      style: "destructive",
                      onPress: () => {
                        if (usePlayer.getState().serverId === server.id) usePlayer.getState().stop();
                        useDownloads.getState().releaseAll(server.id);
                        void unpair(server);
                        // Back to the library, which shows the next server or asks for one.
                        router.dismissTo("/");
                      },
                    },
                  ])
                }
              />
            </View>
          </View>
        ) : null}

        <View>
          <SectionHeading title="Audio" />
          <Card style={{ padding: 14, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.medium, fontSize: 15, color: ink }}>Keep streamed tracks sealed</Text>
                <Note onPrint>Each track arrives encrypted for this phone and is opened only to be played. It starts once the whole track is here. Off, tracks start at once and are only as private as the connection.</Note>
              </View>
              <Switch accessibilityLabel="Keep streamed tracks sealed" value={sealStreams} onValueChange={useServers.getState().setSealStreams} trackColor={{ true: band, false: palette.stripLine }} />
            </View>
          </Card>
        </View>

        <View>
          <SectionHeading title="Kept on this phone" />
          <Card style={{ paddingHorizontal: 14 }}>
            <Row label="Playlists" value={String(Object.keys(shelf?.playlists ?? {}).length)} />
            <Row label="Tracks" value={count(keptTracks.filter((kept) => kept.state === "kept").length, "track")} />
            <Row label="Room taken" value={formatBytes(bytes)} last />
          </Card>
          <View style={{ marginTop: space.sm }}>
            <Note>Kept tracks are stored sealed: encrypted for this phone with a key it agreed with the server. Away from this app they are not audio.</Note>
          </View>
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}
