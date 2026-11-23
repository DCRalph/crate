import type { ReactNode } from "react";
import { Image } from "expo-image";
import { Disc3, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { coverSource } from "@/lib/media";
import { useActiveServer } from "@/lib/servers";
import { font, glass, ink, ink2, insetLine, label, lamp, radius, useGround, usePalette } from "@/lib/theme";

/** A lamp: a small ring, amber when lit. Lit means live: playing, on, downloading. It is drawn for the ground it is on (glass or the cabinet), where a lit one glows, unless told it is `on` print. */
export function Lamp({ lit, on = "ground", size = 9 }: { lit: boolean; on?: "ground" | "print"; size?: number }) {
  const ground = useGround();
  const onPrint = on === "print";
  const rim = lit ? (onPrint ? ink : lamp) : onPrint ? ink2 : ground.chrome2;
  const glows = lit && !onPrint && ground.isNight;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size, borderWidth: 1.5, borderColor: rim, backgroundColor: lit ? lamp : "transparent", opacity: lit ? 1 : 0.6 },
        glows && { shadowColor: lamp, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
      ]}
    />
  );
}

/** A small window of glass set into what it is on, with a dark rim: for a waveform, a field, a row of choices. */
export function Inset({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: glass, borderRadius: radius.md, borderWidth: 1, borderColor: insetLine }, style]}>{children}</View>;
}

/**
 * One choice from a few, as keys in a glass inset: the chosen one is the ivory
 * key, as a page's current tab is. For glass; on print use `Choice`.
 */
export function Segments<T>({ name, options, value, onChange }: { name: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const palette = usePalette();
  const ground = useGround();
  return (
    <Inset style={{ flexDirection: "row", padding: 3, gap: 2, alignSelf: "flex-start" }}>
      <View accessibilityRole="radiogroup" accessibilityLabel={name} style={{ flexDirection: "row", gap: 2 }}>
        {options.map((option) => {
          const chosen = option.value === value;
          return (
            <Pressable
              key={option.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={option.label}
              hitSlop={4}
              onPress={() => onChange(option.value)}
              style={{ height: 30, paddingHorizontal: 12, borderRadius: 5, alignItems: "center", justifyContent: "center", backgroundColor: chosen ? palette.strip : "transparent" }}
            >
              <Text style={[label, { fontSize: 11, color: chosen ? ink : ground.chrome2 }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Inset>
  );
}

/** A number plate: pale figures on dark glass, the same on any ground. `color` lights them (amber, on what is playing). */
export function Plate({ children, style, color }: { children: ReactNode; style?: StyleProp<ViewStyle>; color?: string }) {
  return (
    <View style={[styles.plate, style]}>
      <Text style={[styles.plateText, color ? { color } : null]}>{children}</Text>
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
  /** The size of its sign, for the bigger keys of the transport. */
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  /** For a ghost key: the colour of its sign. */
  color?: string;
  fill?: boolean;
};

/** A key: it sits on a darker edge and goes down a pixel when pressed. */
export function Key({ label: text, icon: Icon, tone = "plain", onPress, disabled, name, small, iconSize, style, color, fill }: KeyProps) {
  const palette = usePalette();
  const ground = useGround();
  const face = tone === "brand" ? palette.band : tone === "plain" ? palette.strip : "transparent";
  const edge = tone === "brand" ? palette.bandDown : tone === "plain" ? palette.stripLine : "transparent";
  const sign = color ?? (tone === "ghost" ? ground.chrome2 : ink);
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
      {Icon ? <Icon size={iconSize ?? (small ? 15 : 17)} color={sign} fill={fill ? sign : "transparent"} strokeWidth={2.2} /> : null}
      {text ? <Text style={[label, { color: sign, fontSize: small ? 11 : 12.5 }]}>{text}</Text> : null}
    </Pressable>
  );
}

/** One choice from a few, as a row of keys on print. The chosen one is inked in. `name` is what a screen reader calls the group. */
export function Choice<T>({ name, options, value, onChange }: { name: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const palette = usePalette();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={name} style={{ flexDirection: "row", borderRadius: radius.md, borderWidth: 1, borderColor: palette.stripLine, overflow: "hidden" }}>
      {options.map((option, position) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{ flex: 1, height: 34, alignItems: "center", justifyContent: "center", backgroundColor: chosen ? ink : "transparent", borderLeftWidth: position ? 1 : 0, borderLeftColor: palette.stripLine }}
          >
            <Text style={[label, { fontSize: 11.5, color: chosen ? palette.strip : ink }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Square cover art from the active server. Shows a plain tile with a disc until the picture is in. An album with no art of its own gets a record label drawn by the server. */
export function Cover({ type, id, size, version, style }: { type: "album" | "playlist" | "artist"; id: number; size: number; version?: string; style?: StyleProp<ViewStyle> }) {
  const server = useActiveServer();
  const ground = useGround();
  return (
    <View style={[{ aspectRatio: 1, backgroundColor: ground.ground === "glass" ? "#0d2a2e" : ground.line, alignItems: "center", justifyContent: "center", overflow: "hidden" }, style]}>
      <Disc3 size={28} color={ground.chrome2} opacity={0.5} />
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
      <Text numberOfLines={1} style={{ backgroundColor: palette.band, color: ink, fontFamily: font.medium, fontSize: 12, lineHeight: 20, paddingHorizontal: 8 }}>
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

/**
 * A section's heading in small capitals. `letter` is the row's letter, in
 * amber before it, as the website letters its rows of tiles; `onMore` puts
 * a See all on the right, and `children` anything else there.
 */
export function SectionHeading({ title, letter, onMore, children }: { title: string; letter?: string; onMore?: () => void; children?: ReactNode }) {
  const ground = useGround();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10, minHeight: 24 }}>
      {letter ? <Text style={{ fontFamily: font.num, fontSize: 18, color: lamp, width: 12 }}>{letter}</Text> : null}
      <Text accessibilityRole="header" style={[label, { color: ground.chrome, fontSize: 12.5, flex: 1 }]}>
        {title}
      </Text>
      {onMore ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`See all ${title}`} hitSlop={10} onPress={onMore}>
          <Text style={[label, { color: ground.chrome2, fontSize: 11 }]}>See all</Text>
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

/** One muted sentence, for a list with nothing in it or something that couldn't be had. */
export function Note({ children, onPrint = false }: { children: ReactNode; onPrint?: boolean }) {
  const ground = useGround();
  return <Text style={{ fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: onPrint ? ink2 : ground.chrome2 }}>{children}</Text>;
}

const styles = StyleSheet.create({
  plate: { backgroundColor: glass, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  plateText: { fontFamily: font.num, color: "#e3ebe8", fontSize: 13.5, letterSpacing: 0.6 },
  mark: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  markText: { fontFamily: font.title, fontSize: 21, color: ink, letterSpacing: 1.2 },
  key: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: radius.md },
});
