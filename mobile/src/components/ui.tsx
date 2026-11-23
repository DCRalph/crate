import type { ReactNode } from "react";
import { Image } from "expo-image";
import { Disc3, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { coverSource } from "@/lib/media";
import { useActiveServer } from "@/lib/servers";
import { band, bandDown, deck, font, glass, ink, ink2, label, lamp, radius, space, usePalette } from "@/lib/theme";

/** A lamp: a small ring, amber when lit. Lit means live: playing, on, kept. It is drawn for the cabinet unless told it is `on` print or night glass. */
export function Lamp({ lit, on = "cabinet", size = 9 }: { lit: boolean; on?: "cabinet" | "print" | "night"; size?: number }) {
  const palette = usePalette();
  const onPrint = on === "print";
  const rim = lit ? (onPrint ? ink : lamp) : onPrint ? ink2 : on === "night" ? deck.chrome2 : palette.chrome2;
  return <View style={{ width: size, height: size, borderRadius: size, borderWidth: 1.5, borderColor: rim, backgroundColor: lit ? lamp : "transparent", opacity: lit ? 1 : 0.6 }} />;
}

/** A number plate: amber figures on dark glass. */
export function Plate({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.plate, style]}>
      <Text style={styles.plateText}>{children}</Text>
    </View>
  );
}

/** The wordmark, lettered on an ivory plate like a maker's badge, with a lamp that is lit while something plays. */
export function Mark({ lit }: { lit: boolean }) {
  const palette = usePalette();
  return (
    <View style={[styles.mark, { backgroundColor: palette.strip }]}>
      <Text style={styles.markText}>CRATE</Text>
      <Lamp lit={lit} on="print" />
    </View>
  );
}

type KeyProps = {
  label?: string;
  icon?: LucideIcon;
  /** Coral is the one key that plays; ivory is every other key; ghost is a sign with no key under it. */
  tone?: "brand" | "plain" | "ghost";
  onPress?: () => void;
  disabled?: boolean;
  /** What a screen reader says when the key shows a sign alone. */
  name?: string;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  /** For a ghost key: the colour of its sign. */
  color?: string;
  fill?: boolean;
};

/** A key: it sits on a darker edge and goes down a pixel when pressed. */
export function Key({ label: text, icon: Icon, tone = "plain", onPress, disabled, name, small, style, color, fill }: KeyProps) {
  const palette = usePalette();
  const face = tone === "brand" ? band : tone === "plain" ? palette.strip : "transparent";
  const edge = tone === "brand" ? bandDown : tone === "plain" ? palette.stripLine : "transparent";
  const sign = color ?? (tone === "ghost" ? palette.chrome2 : ink);
  const height = small ? 30 : 38;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name ?? text}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.key,
        { height, backgroundColor: face, borderBottomColor: edge, borderBottomWidth: tone === "ghost" ? 0 : pressed ? 1 : 3, marginTop: pressed && tone !== "ghost" ? 2 : 0, opacity: disabled ? 0.45 : 1, paddingHorizontal: text ? (small ? 10 : 14) : small ? 8 : 11 },
        style,
      ]}
    >
      {Icon ? <Icon size={small ? 15 : 17} color={sign} fill={fill ? sign : "transparent"} strokeWidth={2.2} /> : null}
      {text ? <Text style={[label, { color: sign, fontSize: small ? 11 : 12.5 }]}>{text}</Text> : null}
    </Pressable>
  );
}

/** Square cover art from the active server. Shows a plain tile with a disc until the picture is in, and keeps it when there is none. */
export function Cover({ type, id, size, version, style }: { type: "album" | "playlist" | "artist"; id: number; size: number; version?: string; style?: StyleProp<ViewStyle> }) {
  const server = useActiveServer();
  const palette = usePalette();
  return (
    <View style={[{ aspectRatio: 1, backgroundColor: palette.cab2, alignItems: "center", justifyContent: "center", overflow: "hidden" }, style]}>
      <Disc3 size={28} color={palette.chrome2} opacity={0.5} />
      {server ? <Image source={coverSource(server, type, id, size, version)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="disk" /> : null}
    </View>
  );
}

/** A tile's strip: the name on ivory, a line of facts on the coral band. */
export function Strip({ title, band: facts, style }: { title: string; band: string; style?: StyleProp<ViewStyle> }) {
  const palette = usePalette();
  return (
    <View style={[{ backgroundColor: palette.strip }, style]}>
      <Text numberOfLines={1} style={[label, { color: ink, fontSize: 12, lineHeight: 24, paddingHorizontal: 8 }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={{ backgroundColor: band, color: ink, fontFamily: font.medium, fontSize: 12, lineHeight: 20, paddingHorizontal: 8 }}>
        {facts || " "}
      </Text>
    </View>
  );
}

/** A printed card: ivory, for anything that is read rather than pressed. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const palette = usePalette();
  return <View style={[{ backgroundColor: palette.strip, borderRadius: radius.lg, overflow: "hidden" }, style]}>{children}</View>;
}

/** A section's heading in small capitals, with something on the right if given. */
export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm, minHeight: 24 }}>
      <Text style={[label, { color: palette.chrome, fontSize: 12 }]}>{title}</Text>
      {children}
    </View>
  );
}

/** One muted sentence, for a list with nothing in it or something that couldn't be had. */
export function Note({ children, onPrint = false }: { children: ReactNode; onPrint?: boolean }) {
  const palette = usePalette();
  return <Text style={{ fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: onPrint ? ink2 : palette.chrome2 }}>{children}</Text>;
}

const styles = StyleSheet.create({
  plate: { backgroundColor: glass, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  plateText: { fontFamily: font.num, color: lamp, fontSize: 13, letterSpacing: 0.6 },
  mark: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  markText: { fontFamily: font.title, fontSize: 21, color: ink, letterSpacing: 1.2 },
  key: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: radius.md },
});
