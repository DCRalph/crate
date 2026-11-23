import { NativeModule, requireOptionalNativeModule } from "expo";

// Next and Previous from the lock screen, Control Centre, headphones and a
// car. The native side is `modules/remote-controls`; the audio library does
// play, pause and seeking itself. A no-op on a build without the module.

declare class RemoteControls extends NativeModule<{ onNext: () => void; onPrevious: () => void }> {
  setEnabled(next: boolean, previous: boolean): void;
}

const native = requireOptionalNativeModule<RemoteControls>("RemoteControls");

export const onRemote = (button: "onNext" | "onPrevious", pressed: () => void) => native?.addListener(button, pressed);
/** Greys out a button that would do nothing. */
export const setRemoteEnabled = (next: boolean, previous: boolean) => native?.setEnabled(next, previous);
