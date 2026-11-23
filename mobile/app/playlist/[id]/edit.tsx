import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDown, ArrowUp, Minus } from "lucide-react-native";
import { Alert, Animated, Text, TextInput, View } from "react-native";

import { useBottomSpace } from "@/components/bottom";
import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { Card, Key, Note, SectionHeading } from "@/components/ui";
import { useTRPC, type RouterOutputs } from "@/lib/api";
import { rowNumber } from "@/lib/format";
import { bad, font, ink, ink2, label, space, usePalette } from "@/lib/theme";

type Playlist = RouterOutputs["playlists"]["byId"];

/** Changes a playlist: its name, the order of its tracks, and which are in it. Nothing is sent until Save. Deleting it is here too. */
export default function EditPlaylistPage() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const trpc = useTRPC();
  const playlist = useQuery(trpc.playlists.byId.queryOptions({ id }));
  const { scrollY, scrollProps } = useScrollHeader();
  const top = useHeaderSpace();
  const bottom = useBottomSpace();

  return (
    <Screen scrollY={scrollY} title="Edit playlist" back>
      <Animated.ScrollView {...scrollProps} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: bottom, gap: space.lg }}>
        {/* The form copies the playlist once, so it waits for the server's answer rather than start from a remembered one that may be behind. */}
        {playlist.data && playlist.isFetchedAfterMount ? <Form playlist={playlist.data} /> : playlist.isError ? <Note>{playlist.error.message}</Note> : null}
      </Animated.ScrollView>
    </Screen>
  );
}

function Form({ playlist }: { playlist: Playlist }) {
  const router = useRouter();
  const palette = usePalette();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = useState(playlist.name);
  const [tracks, setTracks] = useState(playlist.tracks);
  const [error, setError] = useState<string | null>(null);

  const update = useMutation(trpc.playlists.update.mutationOptions());
  const setOrder = useMutation(trpc.playlists.setTracks.mutationOptions());
  const remove = useMutation(trpc.playlists.delete.mutationOptions());
  const busy = update.isPending || setOrder.isPending || remove.isPending;
  const sameTracks = tracks.length === playlist.tracks.length && tracks.every((track, index) => track === playlist.tracks[index]);
  const done = () => queryClient.invalidateQueries(trpc.playlists.pathFilter());

  const move = (from: number, to: number) => {
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setTracks(next);
  };
  const save = async () => {
    setError(null);
    try {
      if (name.trim() !== playlist.name) await update.mutateAsync({ id: playlist.id, name: name.trim() });
      if (!sameTracks) await setOrder.mutateAsync({ id: playlist.id, trackIds: tracks.map((track) => track.id) });
      await done();
      router.back();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn't save.");
    }
  };

  if (!playlist.canEdit) return <Note>{playlist.readOnly ? "This playlist follows a folder on the server, so it can't be changed here." : "This playlist isn't yours to change."}</Note>;

  return (
    <>
      <Card style={{ padding: space.lg, gap: 5 }}>
        <Text style={[label, { color: ink2, fontSize: 11 }]}>Name</Text>
        <TextInput
          accessibilityLabel="Name"
          value={name}
          onChangeText={setName}
          maxLength={120}
          style={{ fontFamily: font.body, fontSize: 16, color: ink, backgroundColor: "#fffbf0", borderWidth: 1, borderColor: palette.stripLine, borderRadius: 6, paddingHorizontal: 12, height: 44 }}
        />
      </Card>

      <View>
        <SectionHeading title={`Tracks (${tracks.length})`} />
        {tracks.length ? (
          <Card>
            {tracks.map((track, index) => (
              <View key={`${track.id}-${track.position}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 12, paddingRight: 6, paddingVertical: 5, borderTopWidth: index ? 1 : 0, borderTopColor: palette.stripLine }}>
                <Text style={{ fontFamily: font.num, fontSize: 15, color: ink2, width: 24 }}>{rowNumber(index)}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 14.5, color: ink }}>
                    {track.title}
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12.5, color: ink2 }}>
                    {track.artistName}
                  </Text>
                </View>
                <Key small tone="ghost" color={ink} icon={ArrowUp} name={`Move ${track.title} up`} disabled={index === 0} onPress={() => move(index, index - 1)} />
                <Key small tone="ghost" color={ink} icon={ArrowDown} name={`Move ${track.title} down`} disabled={index === tracks.length - 1} onPress={() => move(index, index + 1)} />
                <Key small tone="ghost" color={bad} icon={Minus} name={`Remove ${track.title}`} onPress={() => setTracks(tracks.filter((_, position) => position !== index))} />
              </View>
            ))}
          </Card>
        ) : (
          <Note>No tracks. Add some from any track: press and hold it.</Note>
        )}
      </View>

      {error ? <Text style={{ fontFamily: font.medium, fontSize: 14, color: bad }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Key tone="brand" label="Save" disabled={busy || !name.trim() || (name.trim() === playlist.name && sameTracks)} onPress={() => void save()} />
        <Key label="Cancel" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <Key
          label="Delete"
          color={bad}
          disabled={busy}
          onPress={() =>
            Alert.alert(`Delete ${playlist.name}?`, "The playlist goes from the server, for everyone. Its tracks stay in the library.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  remove.mutate(
                    { id: playlist.id },
                    {
                      onSuccess: async () => {
                        await done();
                        router.dismissTo("/playlists");
                      },
                      onError: (failure) => setError(failure.message),
                    },
                  ),
              },
            ])
          }
        />
      </View>
    </>
  );
}
