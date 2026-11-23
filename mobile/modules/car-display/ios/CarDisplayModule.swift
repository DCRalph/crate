import ExpoModulesCore
import UIKit

/// What the car's screen shows. Kept in one place so that the module, which
/// JavaScript talks to, and the scene, which the car starts, both reach it.
final class CarDisplay {
  static let shared = CarDisplay()

  struct State {
    var title = ""
    var artist = ""
    var cover: UIImage?
    /// The track's loudness along its length, each 0 to 1.
    var peaks: [CGFloat] = []
    var position: Double = 0
    var duration: Double = 0
    var playing = false
  }

  var state = State() {
    didSet { onChange?(state) }
  }
  /// The scene, while a car is connected.
  var onChange: ((State) -> Void)?
  /// A key on the car's screen was pressed: "onPrevious", "onToggle" or "onNext".
  var pressed: ((String) -> Void)?
}

/**
 Feeds the car's screen (`CarSceneDelegate`) from the player, which lives in
 JavaScript (`src/lib/car.ts`), and passes the car's keys back to it.
 */
public class CarDisplayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CarDisplay")

    Events("onPrevious", "onToggle", "onNext")

    // A track came on. `cover` is a file on the phone; `peaks` are 0 to 1.
    Function("show") { (title: String, artist: String, cover: String?, peaks: [Double], duration: Double) in
      let image = cover.flatMap { URL(string: $0) }.flatMap { UIImage(contentsOfFile: $0.path) }
      DispatchQueue.main.async {
        var state = CarDisplay.shared.state
        state.title = title
        state.artist = artist
        state.cover = image
        state.peaks = peaks.map { CGFloat($0) }
        state.duration = duration
        CarDisplay.shared.state = state
      }
    }

    Function("progress") { (position: Double, playing: Bool) in
      DispatchQueue.main.async {
        var state = CarDisplay.shared.state
        state.position = position
        state.playing = playing
        CarDisplay.shared.state = state
      }
    }

    OnStartObserving {
      CarDisplay.shared.pressed = { [weak self] key in self?.sendEvent(key, [:]) }
    }

    OnStopObserving {
      CarDisplay.shared.pressed = nil
    }
  }
}
