import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePlayer } from "@/lib/player";
import { space } from "@/lib/theme";

/** The floating tabs and the floating deck, and the gap between what floats. */
export const tabBarHeight = 58;
export const deckHeight = 58;
const floatGap = 8;

/** One spring for everything that floats, so a tab change and the deck settling feel alike. Just under critical damping: a faint give, never a wobble. */
export const floatSpring = { damping: 26, stiffness: 260, mass: 0.9 } as const;

/** Where the lowest floating bar's bottom edge sits: just inside the home indicator. */
export const floatOffset = (bottomInset: number) => Math.max(bottomInset - 6, space.md);

/** Where the deck's bottom edge sits: over the tabs on a tab's page, in their place on any other. */
export const deckOffset = (bottomInset: number, tabs: boolean) => floatOffset(bottomInset) + (tabs ? tabBarHeight + floatGap : 0);

/** Room a page leaves under its content, so the last row scrolls clear of the tabs (on a tab's page) and of the deck (while something is on it). */
export function useBottomSpace(tabs = false) {
  const insets = useSafeAreaInsets();
  const hasDeck = usePlayer((state) => state.queue.length > 0);
  return deckOffset(insets.bottom, tabs) + (hasDeck ? deckHeight + floatGap : 0) + space.xl;
}
