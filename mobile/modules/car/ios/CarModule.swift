import CarPlay
import ExpoModulesCore
import UIKit

/// A picture for a row, fetched with the headers the server wants.
struct CarImage: Record {
  @Field var uri: String = ""
  @Field var headers: [String: String] = [:]
}

/// One row of a list. `browse` opens the list named by `id`; otherwise choosing it plays, and JavaScript is told which.
struct CarItem: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var detail: String?
  @Field var image: CarImage?
  @Field var browse: Bool = false
  @Field var playing: Bool = false
}

struct CarSection: Record {
  @Field var title: String?
  @Field var items: [CarItem] = []
}

/**
 The library in CarPlay. The lists are the system's templates; what goes in
 them comes from JavaScript (`src/lib/car.ts`), which has the server and the
 player. A list asks for its rows by name (`onLoad`), JavaScript answers with
 `fill`, and a row that plays is passed back as `onPick`.
 */
public class CarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Car")

    Events("onLoad", "onPick")

    Function("fill") { (request: Int, sections: [CarSection], empty: String?) in
      DispatchQueue.main.async { CarLibrary.shared.fill(request, sections, empty: empty) }
    }

    OnStartObserving {
      DispatchQueue.main.async {
        CarLibrary.shared.attach { [weak self] name, body in self?.sendEvent(name, body) }
      }
    }

    OnStopObserving {
      DispatchQueue.main.async { CarLibrary.shared.attach(nil) }
    }
  }
}

/// Which list a template shows, and the request it is waiting on.
private final class ListInfo {
  let id: String
  var request = 0
  init(_ id: String) { self.id = id }
}

/// The car's templates and the conversation with JavaScript about them. Main thread only.
final class CarLibrary: NSObject, CPInterfaceControllerDelegate, CPTabBarTemplateDelegate, CPNowPlayingTemplateObserver {
  static let shared = CarLibrary()

  /// The tabs, by the list each shows. The names are the ones `src/lib/car.ts` answers to.
  private static let tabs = [
    (list: "home", title: "Home", symbol: "house.fill"),
    (list: "playlists", title: "Playlists", symbol: "music.note.list"),
    (list: "albums", title: "Albums", symbol: "square.stack.fill"),
    (list: "downloads", title: "Downloads", symbol: "arrow.down.circle.fill"),
  ]

  private weak var interface: CPInterfaceController?
  private var send: ((String, [String: Any]) -> Void)?
  /// Events from before JavaScript was listening: a car can start the app before it has loaded.
  private var unsent: [(String, [String: Any])] = []
  private var waiting: [Int: CPListTemplate] = [:]
  private var lastRequest = 0
  private let images = NSCache<NSString, UIImage>()

  func attach(_ send: ((String, [String: Any]) -> Void)?) {
    self.send = send
    guard let send else { return }
    unsent.forEach(send)
    unsent = []
  }

  func connect(_ interface: CPInterfaceController) {
    self.interface = interface
    interface.delegate = self
    let lists = Self.tabs.map { tab in
      let template = list(tab.list, title: tab.title)
      template.tabTitle = tab.title
      template.tabImage = UIImage(systemName: tab.symbol)
      return template
    }
    let bar = CPTabBarTemplate(templates: lists)
    bar.delegate = self
    interface.setRootTemplate(bar, animated: false, completion: nil)
    lists.forEach(load)

    let nowPlaying = CPNowPlayingTemplate.shared
    nowPlaying.isUpNextButtonEnabled = true
    nowPlaying.upNextTitle = "Up Next"
    nowPlaying.add(self)
  }

  func disconnect() {
    CPNowPlayingTemplate.shared.remove(self)
    interface = nil
    waiting = [:]
  }

  /// JavaScript's answer to a list's request. One that has been asked again since is dropped.
  func fill(_ request: Int, _ sections: [CarSection], empty: String?) {
    guard let template = waiting.removeValue(forKey: request), let info = template.userInfo as? ListInfo, info.request == request else { return }
    // A car takes only so many rows; past that it would refuse the list.
    var room = CPListTemplate.maximumItemCount
    let built = sections.prefix(CPListTemplate.maximumSectionCount).compactMap { section -> CPListSection? in
      let rows = section.items.prefix(max(0, room)).map { row($0, in: info.id) }
      room -= rows.count
      return rows.isEmpty ? nil : CPListSection(items: rows, header: section.title, sectionIndexTitle: nil)
    }
    template.emptyViewTitleVariants = [empty ?? "Nothing here"]
    template.updateSections(built)
  }

  private func list(_ id: String, title: String) -> CPListTemplate {
    let template = CPListTemplate(title: title, sections: [])
    template.userInfo = ListInfo(id)
    template.emptyViewTitleVariants = ["Loading"]
    return template
  }

  /// Asks JavaScript for a list's rows, again each time it is shown, so it stays current.
  private func load(_ template: CPListTemplate) {
    guard let info = template.userInfo as? ListInfo else { return }
    lastRequest += 1
    info.request = lastRequest
    waiting[lastRequest] = template
    emit("onLoad", ["request": lastRequest, "list": info.id])
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    if let send { send(name, body) } else { unsent.append((name, body)) }
  }

  private func row(_ entry: CarItem, in list: String) -> CPListItem {
    let row = CPListItem(text: entry.title, detailText: entry.detail)
    row.isPlaying = entry.playing
    row.accessoryType = entry.browse ? .disclosureIndicator : .none
    if let image = entry.image { artwork(image) { [weak row] in row?.setImage($0) } }
    row.handler = { [weak self] _, done in
      self?.picked(entry, in: list)
      done()
    }
    return row
  }

  private func picked(_ entry: CarItem, in list: String) {
    guard let interface else { return }
    // Loaded as it appears (`templateWillAppear`).
    if entry.browse { return interface.pushTemplate(self.list(entry.id, title: entry.title), animated: true, completion: nil) }
    emit("onPick", ["list": list, "item": entry.id])
    // Up Next was opened from Now playing: back to it.
    if list == "queue" { return interface.popTemplate(animated: true, completion: nil) }
    if !(interface.topTemplate is CPNowPlayingTemplate) { interface.pushTemplate(CPNowPlayingTemplate.shared, animated: true, completion: nil) }
  }

  private func artwork(_ source: CarImage, _ done: @escaping (UIImage) -> Void) {
    let key = source.uri as NSString
    if let cached = images.object(forKey: key) { return done(cached) }
    guard let url = URL(string: source.uri) else { return }
    var request = URLRequest(url: url)
    for (name, value) in source.headers { request.setValue(value, forHTTPHeaderField: name) }
    URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
      guard let data, let image = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        self?.images.setObject(image, forKey: key)
        done(image)
      }
    }.resume()
  }

  // MARK: Templates coming into view

  func templateWillAppear(_ template: CPTemplate, animated: Bool) {
    if let list = template as? CPListTemplate { load(list) }
    // Back to the tabs from a list pushed over them.
    if let bar = template as? CPTabBarTemplate, let list = bar.selectedTemplate as? CPListTemplate { load(list) }
  }

  func tabBarTemplate(_ tabBarTemplate: CPTabBarTemplate, didSelect selectedTemplate: CPTemplate) {
    if let list = selectedTemplate as? CPListTemplate { load(list) }
  }

  func nowPlayingTemplateUpNextButtonTapped(_ nowPlayingTemplate: CPNowPlayingTemplate) {
    interface?.pushTemplate(list("queue", title: "Up Next"), animated: true, completion: nil)
  }
}
