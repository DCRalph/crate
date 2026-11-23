import ExpoModulesCore

/**
 The app's settings as one string in the iCloud key-value store, which iCloud
 carries to the person's other devices. Small things only: the store holds a
 megabyte in all. The JavaScript side is `src/lib/cloud.ts`.

 Needs the `ubiquity-kvstore-identifier` entitlement, set in `app.config.ts`.
 */
public class CloudSettingsModule: Module {
  private let store = NSUbiquitousKeyValueStore.default
  private let key = "settings"
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("CloudSettings")

    Events("onChange")

    // Whether this device is signed in to iCloud. Without that the store only keeps things here.
    Function("available") { () -> Bool in
      FileManager.default.ubiquityIdentityToken != nil
    }

    Function("read") { () -> String? in
      self.store.synchronize()
      return self.store.string(forKey: self.key)
    }

    Function("write") { (value: String) in
      self.store.set(value, forKey: self.key)
      self.store.synchronize()
    }

    // Another device changed the settings.
    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification, object: self.store, queue: .main
      ) { [weak self] _ in
        guard let self else { return }
        self.sendEvent("onChange", ["value": self.store.string(forKey: self.key)])
      }
    }

    OnStopObserving {
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      self.observer = nil
    }
  }
}
