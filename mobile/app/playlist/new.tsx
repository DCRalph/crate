import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, View } from "react-native";

import { Card, Key, Note } from "@/components/ui";
import { useTRPC } from "@/lib/api";
import { bad, font, ink, ink2, label, space, usePalette } from "@/lib/theme";

/** A new playlist: its name, and the track it starts with when it was reached from a track's menu (`trackId`). */
export default function NewPlaylist() {
  const router = useRouter();
  const palette = usePalette();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const trackId = Number(useLocalSearchParams<{ trackId?: string }>().trackId) || null;
  const [name, setName] = useState("");
  const create = useMutation(
    trpc.playlists.create.mutationOptions({
      onSuccess: async (id) => {
        await queryClient.invalidateQueries(trpc.playlists.pathFilter());
        router.dismissTo(`/playlist/${id}`);
      },
    }),
  );
  const submit = () => name.trim() && create.mutate({ name: name.trim(), ...(trackId ? { trackIds: [trackId] } : {}) });

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: palette.cab }} contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      <Text style={{ fontFamily: font.title, fontSize: 30, color: palette.chrome, textTransform: "uppercase" }}>New playlist</Text>
      <Card style={{ padding: space.lg, gap: space.lg }}>
        <View style={{ gap: 5 }}>
          <Text style={[label, { color: ink2, fontSize: 11 }]}>Name</Text>
          <TextInput
            accessibilityLabel="Name"
            autoFocus
            value={name}
            onChangeText={setName}
            maxLength={120}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={{ fontFamily: font.body, fontSize: 16, color: ink, backgroundColor: "#fffbf0", borderWidth: 1, borderColor: palette.stripLine, borderRadius: 6, paddingHorizontal: 12, height: 44 }}
          />
        </View>
        {trackId ? <Note onPrint>It starts with the track you chose.</Note> : null}
        {create.error ? <Text style={{ fontFamily: font.medium, fontSize: 14, color: bad }}>{create.error.message}</Text> : null}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Key tone="brand" label="Create" disabled={!name.trim() || create.isPending} onPress={submit} />
          <Key label="Cancel" onPress={() => router.back()} />
        </View>
      </Card>
    </ScrollView>
  );
}
