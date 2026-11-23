import { Animated, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/screen";
import { useHeaderSpace, useScrollHeader } from "@/components/screen-header";
import { Note } from "@/components/ui";
import { CarScreen } from "@/lib/car";
import { space } from "@/lib/theme";

/** A car's screen in points: the common wide one. The view is laid out at this size and brought down to the phone's width, so it looks as it would in a car. */
const car = { width: 800, height: 480 };

/**
 * The car's screen, running in the app: what a car would show, fed by the
 * same player, with its three keys working. It is here because Xcode 27 gives
 * a simulator no CarPlay to connect; reached from Settings in a build made
 * with `CARPLAY=1`.
 */
export default function CarPage() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = useHeaderSpace();
  const { scrollY, scrollProps } = useScrollHeader();
  const scale = (width - space.lg * 2) / car.width;

  return (
    <Screen scrollY={scrollY} title="Car screen" left="back">
      <Animated.ScrollView {...scrollProps} contentContainerStyle={{ paddingTop: top, paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
        {/* A box the size the screen ends up, holding the screen at its own size, scaled from its corner. */}
        <View style={{ width: car.width * scale, height: car.height * scale, borderRadius: 10, overflow: "hidden" }}>
          <CarScreen style={{ width: car.width, height: car.height, transformOrigin: "top left", transform: [{ scale }] }} />
        </View>
        <Note>This is the screen drawn for a car, running on the phone. Play something and it follows. A real car supplies the three keys itself.</Note>
      </Animated.ScrollView>
    </Screen>
  );
}
