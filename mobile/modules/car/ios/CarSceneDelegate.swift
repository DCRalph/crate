import CarPlay
import UIKit

/**
 The scene a car starts: Crate as a CarPlay audio app, on the system's own
 templates (`CarLibrary`). Now playing is the system's screen, fed by what
 the player puts on the lock screen.

 A car can start the app with nothing up on the phone, and then nothing has
 started JavaScript, which has the library and the player. `startReact` is
 for that: the app subclasses this as `CarScene` and starts it there, where
 the React Native factory is in reach (`plugins/with-carplay.js`).
 */
@objc(CarSceneDelegate)
open class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  public func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
    startReact()
    CarLibrary.shared.connect(interfaceController)
  }

  public func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didDisconnectInterfaceController interfaceController: CPInterfaceController) {
    CarLibrary.shared.disconnect()
  }

  /// Starts JavaScript if the phone's scene hasn't. Does nothing here.
  open func startReact() {}
}
