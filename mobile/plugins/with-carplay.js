const { withAppDelegate, withEntitlementsPlist, withInfoPlist } = require("@expo/config-plugins");

/**
 * Crate as a CarPlay audio app (`CARPLAY=1`, see `app.config.ts`).
 *
 * - The CarPlay audio entitlement. Apple grants it on request; until it is on
 *   the app's profile a build for a phone will not sign. The simulator's
 *   CarPlay window doesn't need it.
 * - The car's scene, `CarScene`, beside the phone's, `PhoneScene`. Both are
 *   written into the app delegate's file, where the React Native factory is:
 *   a car can open the app with nothing up on the phone, and then the car's
 *   scene starts JavaScript itself, into a window the phone's scene takes
 *   over later instead of starting a second copy. See `modules/car`.
 *
 * Listed before `with-scene-lifecycle` in `app.config.ts`: plugins listed
 * earlier change Info.plist and the app delegate later, and this builds on
 * what that one writes.
 */
module.exports = function withCarPlay(config) {
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.carplay-audio"] = true;
    return config;
  });

  config = withInfoPlist(config, (config) => {
    const manifest = config.modResults.UIApplicationSceneManifest ?? {};
    const phone = manifest.UISceneConfigurations?.UIWindowSceneSessionRoleApplication ?? [];
    config.modResults.UIApplicationSceneManifest = {
      ...manifest,
      // The phone's scene and the car's can both be up at once.
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        ...manifest.UISceneConfigurations,
        UIWindowSceneSessionRoleApplication: phone.map((scene) => ({ ...scene, UISceneDelegateClassName: "PhoneScene" })),
        CPTemplateApplicationSceneSessionRoleApplication: [{ UISceneClassName: "CPTemplateApplicationScene", UISceneConfigurationName: "CarPlay", UISceneDelegateClassName: "CarScene" }],
      },
    };
    return config;
  });

  return withAppDelegate(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes("class CarScene")) return config;
    if (!contents.includes("class SceneDelegate: ExpoAppSceneDelegate")) {
      throw new Error("with-carplay: AppDelegate.swift has no SceneDelegate to build the phone's scene on. Check with-scene-lifecycle.");
    }
    config.modResults.contents = contents.replace("import React\n", "import React\ninternal import Car\n") + SCENES;
    return config;
  });
};

const SCENES = `
/// The phone's scene. If the car started React Native first (\`CarScene\`), that
/// window comes onto the phone, rather than a second copy of the app starting.
@objc(PhoneScene)
class PhoneScene: SceneDelegate {
  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene,
      let app = UIApplication.shared.delegate as? AppDelegate,
      let started = app.window, started.windowScene == nil else {
      return super.scene(scene, willConnectTo: session, options: connectionOptions)
    }
    started.windowScene = windowScene
    window = started
    started.makeKeyAndVisible()
  }
}

/// The car's scene (\`modules/car\`), which starts React Native when the car opens the app before the phone has.
@objc(CarScene)
class CarScene: CarSceneDelegate {
  override func startReact() {
    guard let app = UIApplication.shared.delegate as? AppDelegate, app.window == nil, let factory = app.reactNativeFactory else { return }
    // Off screen, until the phone's scene takes it.
    let window = UIWindow(frame: UIScreen.main.bounds)
    app.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
  }
}
`;
