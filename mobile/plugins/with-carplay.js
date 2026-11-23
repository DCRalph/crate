const { withEntitlementsPlist, withInfoPlist } = require("@expo/config-plugins");

/**
 * The car's screen, for the simulator only (`CARPLAY=1`, see `app.config.ts`).
 *
 * It names a second scene, the one a car starts (`modules/car-display`), and
 * asks for the entitlement that lets an app draw on a car's screen. Apple
 * gives that entitlement to navigation apps, so a build with it runs in the
 * simulator and will not sign for a phone. Listed before
 * `with-scene-lifecycle` in `app.config.ts`: plugins listed earlier change
 * Info.plist later, and this adds to the scene list that one writes.
 */
module.exports = function withCarPlay(config) {
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.carplay-maps"] = true;
    return config;
  });

  return withInfoPlist(config, (config) => {
    const manifest = config.modResults.UIApplicationSceneManifest ?? {};
    config.modResults.UIApplicationSceneManifest = {
      ...manifest,
      // The phone's scene and the car's can both be up at once.
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        ...manifest.UISceneConfigurations,
        CPTemplateApplicationSceneSessionRoleApplication: [
          { UISceneClassName: "CPTemplateApplicationScene", UISceneConfigurationName: "CarPlay", UISceneDelegateClassName: "CarSceneDelegate" },
        ],
      },
    };
    return config;
  });
};
