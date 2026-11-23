import CarPlay
import UIKit

/**
 The app on a car's screen, drawn by the app: the cover, the title strip, and
 the track as a waveform that fills as it plays (`CarNowPlayingView`), with
 Previous, Play and Next as the screen's own keys.

 Only a navigation app is given a window to draw in, so this scene is built on
 the map template with nothing of a map in it. That makes it a picture of
 what a drawn Crate would look like in a car, and one that runs in the
 simulator. It cannot be shipped: Apple gives the drawing window to navigation
 apps only, and a music app is held to the system's own templates. See
 `plugins/with-carplay.js`.
 */
@objc(CarSceneDelegate)
public class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  private var interface: CPInterfaceController?
  private let template = CPMapTemplate()
  private var showsPause: Bool?

  public func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController, to window: CPWindow) {
    interface = interfaceController
    let view = CarNowPlayingView()
    view.state = CarDisplay.shared.state
    let controller = UIViewController()
    controller.view = view
    window.rootViewController = controller

    setKeys(playing: CarDisplay.shared.state.playing)
    CarDisplay.shared.onChange = { [weak self, weak view] state in
      view?.state = state
      self?.setKeys(playing: state.playing)
    }
    interfaceController.setRootTemplate(template, animated: false, completion: nil)
  }

  public func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene, didDisconnect interfaceController: CPInterfaceController, from window: CPWindow) {
    CarDisplay.shared.onChange = nil
    interface = nil
  }

  /// The keys are the template's, not ours to draw. They are set again only when Play turns to Pause or back.
  private func setKeys(playing: Bool) {
    guard showsPause != playing else { return }
    showsPause = playing
    template.mapButtons = [
      key("backward.end.fill", "onPrevious"),
      key(playing ? "pause.fill" : "play.fill", "onToggle"),
      key("forward.end.fill", "onNext"),
    ]
  }

  private func key(_ symbol: String, _ name: String) -> CPMapButton {
    let button = CPMapButton { _ in CarDisplay.shared.pressed?(name) }
    button.image = UIImage(systemName: symbol)
    return button
  }
}
