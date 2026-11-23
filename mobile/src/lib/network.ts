import * as Network from "expo-network";
import { create } from "zustand";

/**
 * Whether the phone is on mobile data. Anything else (Wi-Fi, a cable, not yet
 * known) counts as not. Downloads and the quality music streams at both go by
 * it. `watchNetwork` starts it, once, at launch.
 */
export const useNetwork = create<{ mobileData: boolean }>()(() => ({ mobileData: false }));

export function watchNetwork() {
  const changed = (state: Network.NetworkState) => useNetwork.setState({ mobileData: state.type === Network.NetworkStateType.CELLULAR });
  Network.addNetworkStateListener(changed);
  void Network.getNetworkStateAsync().then(changed, () => undefined);
}
