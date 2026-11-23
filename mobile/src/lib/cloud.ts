import { NativeModule, requireOptionalNativeModule } from "expo";

// The iCloud key-value store, holding the app's settings as one string. The
// native side is `modules/cloud-settings`. Everything here is a no-op on a
// build without it.

declare class CloudSettings extends NativeModule<{ onChange: (event: { value: string | null }) => void }> {
  available(): boolean;
  read(): string | null;
  write(value: string): void;
}

const native = requireOptionalNativeModule<CloudSettings>("CloudSettings");

/** Whether this phone is signed in to iCloud, so that what is written reaches the person's other devices. */
export const cloudAvailable = () => native?.available() ?? false;
export const readCloud = () => native?.read() ?? null;
export const writeCloud = (value: string) => native?.write(value);
/** Calls `listener` when another device changes what is stored. */
export const onCloudChange = (listener: (value: string | null) => void) => native?.addListener("onChange", (event) => listener(event.value));
