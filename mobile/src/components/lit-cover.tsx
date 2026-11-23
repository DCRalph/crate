import type { ReactNode } from "react";
import MaskedView from "@react-native-masked-view/masked-view";
import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { coverSource } from "@/lib/media";
import { useActiveServer } from "@/lib/servers";
import { glass, lamp, radius } from "@/lib/theme";
import { Cover } from "./ui";

type CoverOf = { type: "album" | "playlist"; id: number; version?: string };

/** Where a cover's light falls: just under it (a tile), or all round it (a page's cover, Now playing). */
const throws = {
  under: { left: -4, right: -4, top: "35%", bottom: -30, opacity: 1 },
  around: { left: -30, right: -30, top: -18, bottom: -44, opacity: 0.9 },
} as const;

/**
 * The light a cover throws on the glass: the picture again, small and
 * blurred, fading out to nothing at its edges, so it is the cover's own
 * colours and needs nothing worked out from it. Still: it is drawn once.
 */
function Glow({ type, id, version, at }: CoverOf & { at: keyof typeof throws }) {
  const server = useActiveServer();
  if (!server) return null;
  return (
    <MaskedView
      pointerEvents="none"
      style={[styles.glow, throws[at]]}
      maskElement={
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#000" stopOpacity="1" />
              <Stop offset="0.6" stopColor="#000" stopOpacity="0.8" />
              <Stop offset="1" stopColor="#000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      }
    >
      <Image source={coverSource(server, type, id, 64, version)} blurRadius={10} contentFit="cover" cachePolicy="disk" style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
}

/**
 * A cover on the glass, lit from underneath in its own colours, as the
 * website's `glow`. `lit` is the one that is playing: an amber ring and more
 * light (`glow-lit`). `children` go under the cover inside the same edge: a
 * tile's title strip. `size` is the picture asked for, in pixels.
 */
export function LitCover({ cover, size, lit = false, at = "under", children, style }: { cover: CoverOf; size: number; lit?: boolean; at?: keyof typeof throws; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Glow {...cover} at={at} />
      <View style={[styles.face, lit && styles.lit]}>
        <View style={styles.clip}>
          <Cover type={cover.type} id={cover.id} version={cover.version} size={size} />
          {children}
        </View>
        {/* A hairline of light round the edge, or the amber ring on the one playing. */}
        <View pointerEvents="none" style={[styles.edge, lit && styles.ring]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: "absolute" },
  face: { borderRadius: radius.sm, backgroundColor: glass },
  lit: { shadowColor: lamp, shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  clip: { borderRadius: radius.sm, overflow: "hidden" },
  edge: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.12)" },
  ring: { borderWidth: 2, borderColor: lamp },
});
