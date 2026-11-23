import type { ReactNode } from "react";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import type { LucideIcon } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { deck, useGround, usePalette } from "@/lib/theme";

/** Whether this phone draws real Liquid Glass (iOS 26 and later). Read once: it can't change while the app runs. */
const liquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/**
 * Glass, for what floats over the cabinet: the tabs, the deck, the round
 * buttons of a page's bar. The system's Liquid Glass where the phone has it,
 * a blur with a hairline edge elsewhere. It follows the cabinet, light by day
 * and dark by night.
 *  - `night`: dark and petrol at any hour, as the deck is.
 *  - `interactive`: lets Liquid Glass answer a touch, for things that are pressed.
 */
export function Glass({ children, style, night = false, interactive }: { children?: ReactNode; style?: StyleProp<ViewStyle>; night?: boolean; interactive?: boolean }) {
  const palette = usePalette();
  const dark = night || palette.isNight;

  if (liquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme={dark ? "dark" : "light"} tintColor={night ? "rgba(7,26,29,0.78)" : undefined} isInteractive={interactive} style={[{ overflow: "hidden" }, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[styles.fallback, { borderColor: dark ? "rgba(255,255,255,0.18)" : "rgba(14,43,47,0.18)" }, style]}>
      <BlurView tint={dark ? "dark" : "light"} intensity={night ? 70 : 50} style={[StyleSheet.absoluteFill, night && styles.night]} />
      {children}
    </View>
  );
}

/** What is drawn on glass: the cabinet's chrome, or the deck's on night glass. */
export const useGlassInk = (night = false) => {
  const palette = usePalette();
  return night ? deck.chrome : palette.chrome;
};

/** A round glass button with one sign on it: back, close, settings. On the glass window it is night glass, unless told otherwise. */
export function GlassButton({ label, icon: Icon, onPress, size = 40, night: asked, disabled, fill }: { label: string; icon: LucideIcon; onPress: () => void; size?: number; night?: boolean; disabled?: boolean; fill?: boolean }) {
  const ground = useGround();
  const night = asked ?? ground.ground === "glass";
  const ink = useGlassInk(night);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={8} style={{ opacity: disabled ? 0.4 : 1 }}>
      <Glass interactive night={night} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
        <Icon color={ink} fill={fill ? ink : "transparent"} size={size * 0.45} strokeWidth={2.25} />
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fallback: { overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth },
  night: { backgroundColor: "rgba(7,26,29,0.45)" },
});
