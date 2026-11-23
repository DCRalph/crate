import UIKit

/// The Wallbox colours a car's screen uses: always the night cabinet, as the deck is.
private enum Wallbox {
  static let cabinet = UIColor(red: 0x0e / 255, green: 0x2b / 255, blue: 0x2f / 255, alpha: 1)
  static let cabinetRaised = UIColor(red: 0x12 / 255, green: 0x36 / 255, blue: 0x3b / 255, alpha: 1)
  static let chrome = UIColor(red: 0xe3 / 255, green: 0xeb / 255, blue: 0xe8 / 255, alpha: 1)
  static let chromeSoft = UIColor(red: 0x93 / 255, green: 0xad / 255, blue: 0xab / 255, alpha: 1)
  static let strip = UIColor(red: 0xf3 / 255, green: 0xea / 255, blue: 0xd4 / 255, alpha: 1)
  static let ink = UIColor(red: 0x1b / 255, green: 0x1a / 255, blue: 0x16 / 255, alpha: 1)
  static let stripEdge = UIColor(red: 0xcd / 255, green: 0xbf / 255, blue: 0x9b / 255, alpha: 1)
  static let band = UIColor(red: 0xef / 255, green: 0x5b / 255, blue: 0x34 / 255, alpha: 1)
  static let bandEdge = UIColor(red: 0xc9 / 255, green: 0x45 / 255, blue: 0x22 / 255, alpha: 1)
  static let lamp = UIColor(red: 0xff / 255, green: 0xc4 / 255, blue: 0x4d / 255, alpha: 1)

  /// The app's own faces once it has loaded them, the system's otherwise.
  static func font(_ name: String, _ size: CGFloat, _ weight: UIFont.Weight) -> UIFont {
    UIFont(name: name, size: size) ?? .systemFont(ofSize: size, weight: weight)
  }
}

/**
 Now playing, for a car: the cover at the left, the name on ivory and the
 artist on the coral band beside it, and under them the track as its waveform,
 amber up to where it has played and faint after, with the time each side.
 Drawn in one pass whenever the state changes; nothing here animates by itself.
 */
final class CarNowPlayingView: UIView {
  var state = CarDisplay.State() {
    didSet { setNeedsDisplay() }
  }
  /// Draw Previous, Play and Next in the column a car keeps for its own keys, and answer a touch on them. For a screen with no car around it.
  var drawsKeys = false
  /// Where each drawn key is, by the name it is pressed as.
  private var keys: [(name: String, frame: CGRect)] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = Wallbox.cabinet
    contentMode = .redraw
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsDisplay()
  }

  override func draw(_ rect: CGRect) {
    Wallbox.cabinet.setFill()
    UIRectFill(bounds)

    // Clear of the screen's own bars, and of the column of keys at its trailing edge.
    var area = bounds.inset(by: safeAreaInsets).insetBy(dx: 18, dy: 14)
    area.size.width -= 62
    guard area.width > 120, area.height > 80 else { return }
    if drawsKeys { drawKeys(in: CGRect(x: area.maxX + 14, y: area.minY, width: 48, height: area.height)) }

    guard !state.title.isEmpty else {
      draw("Nothing on the deck", in: area, font: Wallbox.font("Jost-Medium", 22, .medium), color: Wallbox.chromeSoft)
      return
    }

    // The cover, square, as tall as the top part allows.
    let waveHeight = min(96, area.height * 0.34)
    let top = CGRect(x: area.minX, y: area.minY, width: area.width, height: area.height - waveHeight - 34)
    let side = min(top.height, area.width * 0.36)
    let cover = CGRect(x: top.minX, y: top.minY, width: side, height: side)
    Wallbox.cabinetRaised.setFill()
    UIBezierPath(roundedRect: cover, cornerRadius: 4).fill()
    if let image = state.cover {
      UIGraphicsGetCurrentContext()?.saveGState()
      UIBezierPath(roundedRect: cover, cornerRadius: 4).addClip()
      image.draw(in: cover)
      UIGraphicsGetCurrentContext()?.restoreGState()
    }

    // The title strip: the name on ivory, the artist on the band.
    let stripX = cover.maxX + 16
    let strip = CGRect(x: stripX, y: cover.minY + max(0, (side - 92) / 2), width: top.maxX - stripX, height: 92)
    let nameRect = CGRect(x: strip.minX, y: strip.minY, width: strip.width, height: 54)
    let artistRect = CGRect(x: strip.minX, y: nameRect.maxY, width: strip.width, height: 38)
    UIGraphicsGetCurrentContext()?.saveGState()
    UIBezierPath(roundedRect: strip, cornerRadius: 4).addClip()
    Wallbox.strip.setFill()
    UIRectFill(nameRect)
    Wallbox.band.setFill()
    UIRectFill(artistRect)
    UIGraphicsGetCurrentContext()?.restoreGState()
    draw(state.title.uppercased(), in: nameRect.insetBy(dx: 12, dy: 0), font: Wallbox.font("Jost-SemiBold", 22, .semibold), color: Wallbox.ink, kern: 1)
    draw(state.artist, in: artistRect.insetBy(dx: 12, dy: 0), font: Wallbox.font("Jost-Medium", 18, .medium), color: Wallbox.ink)

    // The track as a waveform, with the time at each end.
    let timeWidth: CGFloat = 54
    let wave = CGRect(x: area.minX + timeWidth, y: area.maxY - waveHeight, width: area.width - timeWidth * 2, height: waveHeight)
    let played = state.duration > 0 ? CGFloat(min(max(state.position / state.duration, 0), 1)) : 0
    drawWaveform(in: wave, played: played)
    let numerals = Wallbox.font("BigShouldersDisplay-Bold", 20, .bold)
    draw(clock(state.position), in: CGRect(x: area.minX, y: wave.minY, width: timeWidth - 8, height: wave.height), font: numerals, color: Wallbox.lamp, align: .right)
    draw(clock(state.duration), in: CGRect(x: wave.maxX + 8, y: wave.minY, width: timeWidth - 8, height: wave.height), font: numerals, color: Wallbox.chromeSoft)
  }

  /// The three keys, stacked: ivory for Previous and Next, the band for Play, each on its darker edge like the keys in the app.
  private func drawKeys(in column: CGRect) {
    let drawn: [(name: String, symbol: String, face: UIColor, edge: UIColor)] = [
      ("onPrevious", "backward.end.fill", Wallbox.strip, Wallbox.stripEdge),
      ("onToggle", state.playing ? "pause.fill" : "play.fill", Wallbox.band, Wallbox.bandEdge),
      ("onNext", "forward.end.fill", Wallbox.strip, Wallbox.stripEdge),
    ]
    let height: CGFloat = 44
    let gap: CGFloat = 12
    var y = column.midY - (height * 3 + gap * 2) / 2
    keys = []
    for key in drawn {
      let face = CGRect(x: column.minX, y: y, width: column.width, height: height)
      keys.append((key.name, face))
      key.edge.setFill()
      UIBezierPath(roundedRect: face.offsetBy(dx: 0, dy: 3), cornerRadius: 6).fill()
      key.face.setFill()
      UIBezierPath(roundedRect: face, cornerRadius: 6).fill()
      if let sign = UIImage(systemName: key.symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .bold))?.withTintColor(Wallbox.ink, renderingMode: .alwaysOriginal) {
        sign.draw(at: CGPoint(x: face.midX - sign.size.width / 2, y: face.midY - sign.size.height / 2))
      }
      y += height + gap
    }
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard drawsKeys, let point = touches.first?.location(in: self) else { return }
    // A finger is wider than a key drawn for a car's screen.
    if let key = keys.first(where: { $0.frame.insetBy(dx: -8, dy: -6).contains(point) }) { CarDisplay.shared.pressed?(key.name) }
  }

  /// Bars about a centre line: three points wide with a point between, as many as fit. With no waveform yet it is a plain line that fills.
  private func drawWaveform(in rect: CGRect, played: CGFloat) {
    let pitch: CGFloat = 4
    let count = max(1, Int(rect.width / pitch))
    let peaks = state.peaks
    for bar in 0..<count {
      var level: CGFloat = 0.06
      if !peaks.isEmpty {
        let from = bar * peaks.count / count
        let to = max(from + 1, (bar + 1) * peaks.count / count)
        level = max(0.06, peaks[from..<min(to, peaks.count)].max() ?? 0)
      }
      let height = max(3, rect.height * level)
      let isPlayed = CGFloat(bar) / CGFloat(count) < played
      (isPlayed ? Wallbox.lamp : Wallbox.chromeSoft.withAlphaComponent(0.45)).setFill()
      UIBezierPath(roundedRect: CGRect(x: rect.minX + CGFloat(bar) * pitch, y: rect.midY - height / 2, width: 3, height: height), cornerRadius: 1).fill()
    }
  }

  /// One line of text, centred on the rect's height and cut short with an ellipsis if it runs out of room.
  private func draw(_ text: String, in rect: CGRect, font: UIFont, color: UIColor, kern: CGFloat = 0, align: NSTextAlignment = .left) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineBreakMode = .byTruncatingTail
    paragraph.alignment = align
    let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color, .kern: kern, .paragraphStyle: paragraph]
    let line = font.lineHeight
    (text as NSString).draw(in: CGRect(x: rect.minX, y: rect.midY - line / 2, width: rect.width, height: line), withAttributes: attributes)
  }

  private func clock(_ seconds: Double) -> String {
    let whole = Int(max(0, seconds))
    return "\(whole / 60):" + String(format: "%02d", whole % 60)
  }
}
