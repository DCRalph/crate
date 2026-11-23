import { NativeModule, requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";

// The iCloud key-value store, holding the app's settings as one string. The
// native side is `modules/cloud-settings`. Everything here is a no-op on a
// build without it.

declare class CloudSettings extends NativeModule<{ onChange: (event: { value: string | null }) => void }> {
  available(): boolean;
  read(): string | null;
  write(value: string): void;
}

// A build made without the iCloud entitlement (`ICLOUD=0`, see `app.config.ts`) has the module but nowhere for it to write.
const native = Constants.expoConfig?.extra?.icloud === false ? null : requireOptionalNativeModule<CloudSettings>("CloudSettings");

/** Whether this build has iCloud at all. */
export const cloudBuiltIn = native !== null;
/** Whether this phone is signed in to iCloud, so that what is written reaches the person's other devices. */
export const cloudAvailable = () => native?.available() ?? false;
export const readCloud = () => native?.read() ?? null;
export const writeCloud = (value: string) => native?.write(value);
/** Calls `listener` when another device changes what is stored. */
export const onCloudChange = (listener: (value: string | null) => void) => native?.addListener("onChange", (event) => listener(event.value));
