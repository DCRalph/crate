import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, Key, Mark, Note } from "@/components/ui";
import { hello, normaliseUrl, pair, useServers } from "@/lib/servers";
import { bad, font, ink, ink2, label, space, usePalette } from "@/lib/theme";

function Field({ label: text, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const palette = usePalette();
  return (
    <View style={{ gap: 5 }}>
      <Text style={[label, { color: ink2, fontSize: 11 }]}>{text}</Text>
      <TextInput
        accessibilityLabel={text}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#a89f86"
        {...input}
        style={{ fontFamily: font.body, fontSize: 16, color: ink, backgroundColor: "#fffbf0", borderWidth: 1, borderColor: palette.stripLine, borderRadius: 6, paddingHorizontal: 12, height: 44 }}
      />
    </View>
  );
}

/**
 * Pairs the phone with a server, in two steps: its address, which is checked
 * to be one of ours, then an account on it. The password is used once to
 * pair and isn't kept; the phone gets a token of its own.
 */
export default function AddServer() {
  const router = useRouter();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const first = useServers((state) => state.servers.length === 0);
  const [address, setAddress] = useState("");
  const [found, setFound] = useState<{ url: string; name: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs a step, showing what went wrong in words if it fails. */
  const attempt = async (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };
  const find = () =>
    attempt(async () => {
      const url = normaliseUrl(address);
      setFound({ url, name: (await hello(url)).name });
    });
  const signIn = () =>
    attempt(async () => {
      if (!found) return;
      useServers.getState().add(await pair(found.url, username.trim(), password));
      // The app's pages are made again around the new server, and open on Home.
      router.replace("/");
    });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: palette.cab }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, paddingTop: (first ? insets.top : 0) + space.xl, gap: space.lg }}>
        <View style={{ flexDirection: "row" }}>
          <Mark lit={false} />
        </View>
        <Text style={{ fontFamily: font.title, fontSize: 30, color: palette.chrome, textTransform: "uppercase" }}>{found ? `Sign in to ${found.name}` : "Add a server"}</Text>
        <Card style={{ padding: space.lg, gap: space.lg }}>
          {found ? (
            <>
              <Field label="Username" value={username} onChangeText={setUsername} textContentType="username" autoFocus returnKeyType="next" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" returnKeyType="go" onSubmitEditing={signIn} />
              <Note onPrint>Your password is used once to pair this phone and isn&apos;t kept on it. The phone then shows under Music apps on the server, where it can be removed.</Note>
            </>
          ) : (
            <>
              <Field label="Server address" value={address} onChangeText={setAddress} placeholder="192.168.1.20:3000" keyboardType="url" autoFocus returnKeyType="go" onSubmitEditing={find} />
              <Note onPrint>The address you open the website at.</Note>
            </>
          )}
          {error ? <Text style={{ fontFamily: font.medium, fontSize: 14, color: bad }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {found ? <Key tone="brand" label="Pair this phone" disabled={busy || !username.trim() || !password} onPress={signIn} /> : <Key tone="brand" label="Find it" disabled={busy || !address.trim()} onPress={find} />}
            {found ? <Key label="Another address" disabled={busy} onPress={() => setFound(null)} /> : first ? null : <Key label="Cancel" onPress={() => router.back()} />}
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
