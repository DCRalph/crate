import ExpoModulesCore
import MediaPlayer

/**
 Next and Previous, wherever the system offers them: the lock screen, Control
 Centre, headphones, and a car's Now Playing screen. The audio library handles
 play, pause and seeking and leaves these two alone, so the queue (which lives
 in JavaScript, `src/lib/player.ts`) is told about them here.
 */
public class RemoteControlsModule: Module {
  private var targets: [(MPRemoteCommand, Any)] = []

  public func definition() -> ModuleDefinition {
    Name("RemoteControls")

    Events("onNext", "onPrevious")

    // Greys out a button that would do nothing: Next on the last track.
    Function("setEnabled") { (next: Bool, previous: Bool) in
      DispatchQueue.main.async {
        let center = MPRemoteCommandCenter.shared()
        center.nextTrackCommand.isEnabled = next
        center.previousTrackCommand.isEnabled = previous
      }
    }

    OnStartObserving {
      let center = MPRemoteCommandCenter.shared()
      self.targets = [
        (center.nextTrackCommand, center.nextTrackCommand.addTarget { [weak self] _ in
          self?.sendEvent("onNext", [:])
          return .success
        }),
        (center.previousTrackCommand, center.previousTrackCommand.addTarget { [weak self] _ in
          self?.sendEvent("onPrevious", [:])
          return .success
        }),
      ]
    }

    OnStopObserving {
      for (command, target) in self.targets { command.removeTarget(target) }
      self.targets = []
    }
  }
}
