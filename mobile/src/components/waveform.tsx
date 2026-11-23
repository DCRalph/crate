import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanResponder, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useTRPC } from "@/lib/api";

/** A bar and the gap after it, in points: a bar one wide, then half a point of gap, as on the website. */
const pitch = 1.5;

/** The bars as one path, about a centre line. */
const Bars = memo(function Bars({ peaks, count, color, opacity }: { peaks: number[]; count: number; color: string; opacity: number }) {
  const path = useMemo(() => {
    let d = "";
    for (let bar = 0; bar < count; bar++) {
      const from = Math.floor((bar * peaks.length) / count);
      const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / count));
      let peak = 0;
      for (let i = from; i < to; i++) peak = Math.max(peak, peaks[i] ?? 0);
      // Never nothing: silence is still a thin line.
      const height = Math.max(4, (peak / 255) * 100);
      d += `M${bar * pitch} ${(100 - height) / 2}h1v${height}h-1z`;
    }
    return d;
  }, [peaks, count]);
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${count * pitch} 100`} preserveAspectRatio="none">
      <Path d={path} fill={color} opacity={opacity} />
    </Svg>
  );
});

/**
 * A track drawn as its waveform, one colour: the played part solid, the rest
 * faint. Touch or drag along it to move through the track; the move happens
 * when the finger lifts. With no waveform to draw it is a plain line.
 */
export function Waveform({ trackId, position, duration, color, onSeek, height = 40 }: { trackId: number | undefined; position: number; duration: number; color: string; onSeek: (seconds: number) => void; height?: number }) {
  const trpc = useTRPC();
  const waveform = useQuery(trpc.library.waveform.queryOptions({ trackId: trackId ?? 0 }, { enabled: trackId !== undefined, staleTime: Infinity, retry: false }));
  const [width, setWidth] = useState(0);
  /** Where the finger is, as a share of the width, while it is down. */
  const [touched, setTouched] = useState<number | null>(null);
  const played = touched ?? (duration ? Math.min(position / duration, 1) : 0);
  const count = Math.max(1, Math.floor(width / pitch));
  const peaks = trackId === undefined ? undefined : waveform.data;

  const responder = useMemo(() => {
    const share = (x: number) => Math.min(1, Math.max(0, x / Math.max(width, 1)));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => setTouched(share(event.nativeEvent.locationX)),
      onPanResponderMove: (event) => setTouched(share(event.nativeEvent.locationX)),
      onPanResponderRelease: (event) => {
        onSeek(share(event.nativeEvent.locationX) * duration);
        setTouched(null);
      },
      onPanResponderTerminate: () => setTouched(null),
    });
  }, [width, duration, onSeek]);

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      style={{ flex: 1, height, justifyContent: "center" }}
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      {...responder.panHandlers}
    >
      {peaks && width ? (
        <>
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
            <Bars peaks={peaks} count={count} color={color} opacity={0.4} />
          </View>
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${played * 100}%`, overflow: "hidden" }}>
            <View style={{ width, height: "100%" }}>
              <Bars peaks={peaks} count={count} color={color} opacity={1} />
            </View>
          </View>
        </>
      ) : (
        <View pointerEvents="none" style={{ height: 3, borderRadius: 2, backgroundColor: color, opacity: 0.25 }}>
          <View style={{ height: 3, borderRadius: 2, width: `${played * 100}%`, backgroundColor: color }} />
        </View>
      )}
    </View>
  );
}
