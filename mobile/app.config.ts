import { readFileSync } from "node:fs";

import type { ExpoConfig } from "expo/config";

// The version, from one place: package.json.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// iCloud for settings needs a signing profile that carries the capability, which a free
// Apple account can't have. `ICLOUD=0` builds without it, and the app then says it has none.
const icloud = process.env.ICLOUD !== "0";
// `CARPLAY=1` makes Crate a CarPlay audio app (`plugins/with-carplay.js`). A phone build with it signs only once Apple has granted the entitlement.
const carplay = process.env.CARPLAY === "1";

/**
 * Crate for iOS. It talks to servers people run themselves, usually at home
 * and often by a plain address on the local network, so it is allowed to make
 * plain-http connections. Audio it keeps is sealed by the server either way
 * (see `src/lib/sealed.ts`).
 */
const config: ExpoConfig = {
  name: "Crate",
  slug: "crate",
  version: pkg.version,
  orientation: "portrait",
  scheme: "crate",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "app.crate.mobile",
    supportsTablet: false,
    // The settings a person chooses can follow them through iCloud (`modules/cloud-settings`). Music never does.
    entitlements: icloud ? { "com.apple.developer.ubiquity-kvstore-identifier": "$(TeamIdentifierPrefix)$(CFBundleIdentifier)" } : {},
    infoPlist: {
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
      NSLocalNetworkUsageDescription: "Crate connects to music servers on your network.",
      // Only the encryption that comes with the operating system.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-asset",
    "expo-font",
    // Music carries on with the screen locked. The app never records.
    ["expo-audio", { enableBackgroundPlayback: true, microphonePermission: false }],
    ["expo-splash-screen", { backgroundColor: "#0e2b2f", image: "./assets/splash.png", imageWidth: 180 }],
    // Before the scene plugin in this list, so that it runs after it and builds the car's scene on the phone's.
    ...(carplay ? ["./plugins/with-carplay"] : []),
    // iOS 27 kills an app at launch that doesn't start from a scene, and this Expo's template doesn't yet. Goes with SDK 58.
    "./plugins/with-scene-lifecycle",
  ],
  experiments: { typedRoutes: true },
  extra: { icloud, carplay },
};

export default config;
