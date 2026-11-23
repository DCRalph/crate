import { NativeModule, requireOptionalNativeModule } from "expo";
import { File, Paths } from "expo-file-system";

import { clientFor } from "./api";
import { coverSource } from "./media";
import { usePlayer } from "./player";
import { useServers } from "./servers";

// The car's screen: what is playing, drawn with its waveform, and its three
// keys. The native side is `modules/car-display`, which only does anything in
// a build made with `CARPLAY=1`; this feeds it either way, which costs nothing
// when no car is there.

declare class CarDisplay extends NativeModule<{ onPrevious: () => void; onToggle: () => void; onNext: () => void }> {
  show(title: string, artist: string, cover: string | null, peaks: number[], duration: number): void;
  progress(position: number, playing: boolean): void;
}

const native = requireOptionalNativeModule<CarDisplay>("CarDisplay");

/** Bars a car's screen has room for. The stored waveform is brought down to this, each bar its loudest moment, 0 to 1. */
const bars = 180;
function shrink(peaks: number[]) {
  return Array.from({ length: bars }, (_, bar) => {
    const from = Math.floor((bar * peaks.length) / bars);
    const to = Math.max(from + 1, Math.floor(((bar + 1) * peaks.length) / bars));
    return Math.max(0, ...peaks.slice(from, to)) / 255;
  });
}

/** Keeps the car's screen in step with the player, and the player with the car's keys. Call once, at launch. */
export function watchCar() {
  if (!native) return;
  native.addListener("onPrevious", () => usePlayer.getState().previous());
  native.addListener("onToggle", () => usePlayer.getState().toggle());
  native.addListener("onNext", () => usePlayer.getState().next());

  let shown: number | undefined;
  usePlayer.subscribe((state) => {
    const track = state.queue[state.index];
    native.progress(state.position, state.playing);
    if (track?.id === shown) return;
    shown = track?.id;
    if (!track) return native.show("", "", null, [], 0);
    // The name at once; the cover and the waveform as each arrives.
    native.show(track.title, track.artistName, null, [], track.duration);
    const server = useServers.getState().servers.find((candidate) => candidate.id === state.serverId);
    if (!server) return;
    const cover = coverSource(server, "album", track.albumId, 600);
    const file = new File(Paths.cache, "car-cover.jpg");
    if (file.exists) file.delete();
    void Promise.all([
      File.downloadFileAsync(cover.uri, file, { headers: cover.headers }).then(
        () => file.uri,
        () => null,
      ),
      clientFor(server)
        .library.waveform.query({ trackId: track.id })
        .catch(() => null),
    ]).then(([art, peaks]) => {
      if (shown === track.id) native.show(track.title, track.artistName, art, peaks ? shrink(peaks) : [], track.duration);
    });
  });
}
