import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Alert, Animated, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { Card, Choice, Key, Note, SectionHeading } from "@/components/ui";
import { cloudAvailable } from "@/lib/cloud";
import { useDownloads } from "@/lib/downloads";
import { count, formatBytes } from "@/lib/format";
import { usePlayer } from "@/lib/player";
import { unpair, useActiveServer, useServers } from "@/lib/servers";
import { qualities, qualityName, useSettings } from "@/lib/settings";
import { band, font, ink, ink2, space, usePalette } from "@/lib/theme";

const qualityChoices = qualities.map((value) => ({ value, label: qualityName(value) }));
const connectionChoices = [
  { value: "wifi", label: "Wi-Fi only" },
  { value: "any", label: "Any connection" },
] as const;

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

/** One setting on a card: its name, a line about it, and its control. A switch sits beside them (`aside`); anything wider goes under. */
function Setting({ title, note, aside, children, last = false }: { title: string; note?: string; aside?: ReactNode; children?: ReactNode; last?: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ gap: 8, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: palette.stripLine }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: font.medium, fontSize: 15, color: ink }}>{title}</Text>
          {note ? <Note onPrint>{note}</Note> : null}
        </View>
        {aside}
      </View>
      {children}
    </View>
  );
}

/**
 * The server in use and who the phone is paired as, then how the app behaves:
 * the quality music plays and downloads at, which connections downloads may
 * use, and whether these choices follow the person through iCloud.
 */
export default function Settings() {
  const router = useRouter();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const top = useHeaderSpace();
  const { scrollY, scrollProps } = useScrollHeader();
  const server = useActiveServer();
  const serverCount = useServers((state) => state.servers.length);
  const settings = useSettings();
  const shelf = useDownloads((state) => (server ? state.shelves[server.id] : undefined));
  const downloads = Object.values(shelf?.tracks ?? {});
  const bytes = downloads.reduce((sum, entry) => sum + entry.bytes, 0);
  const hasCloud = cloudAvailable();
  const track = { true: band, false: palette.stripLine };

  return (
    <Screen scrollY={scrollY} title="Settings" left="back">
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.xl }}>
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
                  Alert.alert(`Sign out of ${server.name}?`, "This phone's access is removed from the server, and everything downloaded from it is removed from the phone.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Sign out",
                      style: "destructive",
                      onPress: () => {
                        if (usePlayer.getState().serverId === server.id) usePlayer.getState().stop();
                        useDownloads.getState().removeAll(server.id);
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
          <SectionHeading title="Playback" />
          <Card style={{ paddingHorizontal: 14 }}>
            <Setting title="Streaming quality" note="The most a track is sent at, in kbps. Anything above is converted by the server first.">
              <Choice name="Streaming quality" options={qualityChoices} value={settings.streamQuality} onChange={(streamQuality) => settings.change({ streamQuality })} />
            </Setting>
            <Setting
              last
              title="Encrypt streamed tracks"
              note="Each track arrives encrypted for this phone and is opened only to be played. It starts once the whole track is here. Off, tracks start at once and are only as private as the connection."
              aside={<Switch accessibilityLabel="Encrypt streamed tracks" value={settings.sealStreams} onValueChange={(sealStreams) => settings.change({ sealStreams })} trackColor={track} />}
            />
          </Card>
        </View>

        <View>
          <SectionHeading title="Downloads" />
          <Card style={{ paddingHorizontal: 14 }}>
            <Setting title="Download quality" note="In kbps, for what is downloaded from now on.">
              <Choice name="Download quality" options={qualityChoices} value={settings.downloadQuality} onChange={(downloadQuality) => settings.change({ downloadQuality })} />
            </Setting>
            <Setting title="Download over">
              <Choice name="Download over" options={connectionChoices} value={settings.downloadOver} onChange={(downloadOver) => settings.change({ downloadOver })} />
            </Setting>
            <Setting
              title="Update downloaded playlists"
              note="When a playlist changes on the server, its download follows: new tracks arrive and removed ones go. Checked when the app opens, on the connections above."
              aside={<Switch accessibilityLabel="Update downloaded playlists" value={settings.syncDownloads} onValueChange={(syncDownloads) => settings.change({ syncDownloads })} trackColor={track} />}
            />
            <Row label="Playlists" value={String(Object.keys(shelf?.playlists ?? {}).length)} />
            <Row label="Tracks" value={count(downloads.filter((entry) => entry.state === "downloaded").length, "track")} />
            <Row label="Room taken" value={formatBytes(bytes)} last />
          </Card>
          <View style={{ marginTop: space.sm }}>
            <Note>Downloads are stored encrypted for this phone, with a key it agreed with the server. Away from this app they are not audio.</Note>
          </View>
        </View>

        <View>
          <SectionHeading title="iCloud" />
          <Card style={{ paddingHorizontal: 14 }}>
            <Setting
              last
              title="Sync settings with iCloud"
              note={hasCloud ? "The choices under Playback and Downloads follow you to your other devices. Music, downloads and sign-ins stay on each phone." : "Sign in to iCloud on this phone to use this."}
              aside={<Switch accessibilityLabel="Sync settings with iCloud" disabled={!hasCloud} value={hasCloud && settings.cloudSync} onValueChange={settings.setCloudSync} trackColor={track} />}
            />
          </Card>
        </View>
      </Animated.ScrollView>
    </Screen>
  );
}
