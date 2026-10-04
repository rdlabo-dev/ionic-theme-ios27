import UIKit

/// Mini-player content hosted in `UITabAccessory` (iOS 26+).
@available(iOS 26.0, *)
final class ShellTabAccessoryContentView: UIView, UIGestureRecognizerDelegate {
    var onPlayPause: (() -> Void)?
    var onTap: (() -> Void)?
    var onArtwork: (() -> Void)?

    private static let swipeUpThreshold: CGFloat = 50
    private static let swipeMaxHorizontalDrift: CGFloat = 48
    /// UITabAccessory's glass platter is about 42pt on iOS 26; content must fit that, not a CSS height.
    private static let minInset: CGFloat = 4
    private static let regularArtwork: CGFloat = 36
    private static let inlineArtwork: CGFloat = 28

    private let artworkButton = UIButton(type: .custom)
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let playPauseButton = UIButton(type: .system)
    private let elapsedLabel = UILabel()
    private let durationLabel = UILabel()
    private let stack = UIStackView()
    private let textStack = UIStackView()
    private let timeStack = UIStackView()
    private let progressTrack = UIView()
    private let progressFill = UIView()
    private var isPlaying = false
    private var isInlineLayout = false
    private var progress: CGFloat = -1
    private var progressColor: UIColor?
    private var artworkSize: NSLayoutConstraint?
    private var artworkMax: NSLayoutConstraint?
    private var stackLeading: NSLayoutConstraint?
    private var stackTrailing: NSLayoutConstraint?
    private var stackTop: NSLayoutConstraint?
    private var stackBottom: NSLayoutConstraint?
    private var panGesture: UIPanGestureRecognizer?
    private var suppressNextTap = false
    var currentArtworkUrl: String?
    var hasArtwork: Bool { artworkButton.image(for: .normal) != nil }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        titleLabel.font = .preferredFont(forTextStyle: .subheadline).withWeight(.semibold)
        titleLabel.textColor = .label
        titleLabel.numberOfLines = 1
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        subtitleLabel.font = .preferredFont(forTextStyle: .caption1)
        subtitleLabel.textColor = .secondaryLabel
        subtitleLabel.numberOfLines = 1
        subtitleLabel.lineBreakMode = .byTruncatingTail
        subtitleLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        elapsedLabel.font = .monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        elapsedLabel.textColor = .label
        elapsedLabel.textAlignment = .right
        elapsedLabel.setContentHuggingPriority(.required, for: .horizontal)
        elapsedLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
        durationLabel.font = .monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        durationLabel.textColor = .secondaryLabel
        durationLabel.textAlignment = .right
        durationLabel.setContentHuggingPriority(.required, for: .horizontal)
        durationLabel.setContentCompressionResistancePriority(.required, for: .horizontal)
        artworkButton.imageView?.contentMode = .scaleAspectFill
        artworkButton.contentHorizontalAlignment = .fill
        artworkButton.contentVerticalAlignment = .fill
        artworkButton.clipsToBounds = true
        artworkButton.layer.cornerRadius = 6
        artworkButton.layer.cornerCurve = .continuous
        artworkButton.backgroundColor = .secondarySystemFill
        artworkButton.accessibilityLabel = "Artwork"
        artworkButton.addTarget(self, action: #selector(artworkTapped), for: .touchUpInside)
        let artworkHeight = artworkButton.heightAnchor.constraint(equalToConstant: Self.regularArtwork)
        artworkHeight.priority = .defaultHigh
        artworkHeight.isActive = true
        artworkSize = artworkHeight
        artworkButton.widthAnchor.constraint(equalTo: artworkButton.heightAnchor).isActive = true
        artworkButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 22).isActive = true
        playPauseButton.addTarget(self, action: #selector(playPauseTapped), for: .touchUpInside)
        playPauseButton.tintColor = .label
        playPauseButton.accessibilityLabel = "Play or pause"
        playPauseButton.setContentHuggingPriority(.required, for: .horizontal)
        playPauseButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        playPauseButton.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        playPauseButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        let playHeight = playPauseButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        playHeight.priority = .defaultHigh
        playHeight.isActive = true
        var config = UIButton.Configuration.plain()
        config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 6, bottom: 6, trailing: 6)
        playPauseButton.configuration = config
        updatePlayImage()
        textStack.axis = .vertical
        textStack.spacing = 1
        textStack.alignment = .leading
        textStack.addArrangedSubview(titleLabel)
        textStack.addArrangedSubview(subtitleLabel)
        textStack.setContentHuggingPriority(.defaultLow, for: .horizontal)
        timeStack.axis = .vertical
        timeStack.spacing = 1
        timeStack.alignment = .trailing
        timeStack.addArrangedSubview(elapsedLabel)
        timeStack.addArrangedSubview(durationLabel)
        timeStack.setContentHuggingPriority(.required, for: .horizontal)
        timeStack.setContentCompressionResistancePriority(.required, for: .horizontal)
        timeStack.isHidden = true
        stack.axis = .horizontal
        stack.alignment = .center
        stack.distribution = .fill
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(artworkButton)
        stack.addArrangedSubview(textStack)
        stack.addArrangedSubview(timeStack)
        stack.addArrangedSubview(playPauseButton)
        stack.setCustomSpacing(8, after: textStack)
        stack.setCustomSpacing(4, after: timeStack)
        addSubview(stack)
        progressTrack.translatesAutoresizingMaskIntoConstraints = false
        progressTrack.isUserInteractionEnabled = false
        progressTrack.isHidden = true
        progressFill.isUserInteractionEnabled = false
        progressTrack.addSubview(progressFill)
        addSubview(progressTrack)
        applyProgressColors()
        let leading = stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16)
        let trailing = stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10)
        let top = stack.topAnchor.constraint(greaterThanOrEqualTo: topAnchor, constant: Self.minInset)
        let bottom = stack.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor, constant: -Self.minInset)
        let centerY = stack.centerYAnchor.constraint(equalTo: centerYAnchor)
        stackLeading = leading
        stackTrailing = trailing
        stackTop = top
        stackBottom = bottom
        let artworkCap = artworkButton.heightAnchor.constraint(
            lessThanOrEqualTo: heightAnchor, constant: -(Self.minInset * 2)
        )
        artworkMax = artworkCap
        NSLayoutConstraint.activate([
            leading, trailing, top, bottom, centerY, artworkCap,
            playPauseButton.heightAnchor.constraint(lessThanOrEqualTo: heightAnchor),
            progressTrack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
            progressTrack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
            progressTrack.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -4),
            progressTrack.heightAnchor.constraint(equalToConstant: 2.5),
        ])
        let tap = UITapGestureRecognizer(target: self, action: #selector(bodyTapped))
        tap.delegate = self
        addGestureRecognizer(tap)
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pan.delegate = self
        pan.cancelsTouchesInView = false
        pan.maximumNumberOfTouches = 1
        addGestureRecognizer(pan)
        panGesture = pan
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func apply(_ node: ShellControl) {
        titleLabel.text = node.title ?? node.items.first?.content.label
        let subtitle = node.subtitle
        subtitleLabel.text = subtitle
        subtitleLabel.isHidden = isInlineLayout || subtitle?.isEmpty != false
        elapsedLabel.text = node.elapsed
        durationLabel.text = node.duration
        let hasTime = !(node.elapsed?.isEmpty ?? true) || !(node.duration?.isEmpty ?? true)
        elapsedLabel.isHidden = node.elapsed?.isEmpty ?? true
        durationLabel.isHidden = node.duration?.isEmpty ?? true
        timeStack.isHidden = !hasTime
        isPlaying = node.items.first?.content.selected == true
            || node.items.first?.content.label.lowercased().contains("pause") == true
        updatePlayImage()
        if let progress = node.progress {
            setProgress(CGFloat(progress))
        }
        if let color = node.progressColor {
            setProgressColor(UIColor.parseCSS(color))
        }
    }

    func setProgress(_ value: CGFloat) {
        progress = value
        progressTrack.isHidden = !value.isFinite || value < 0
        setNeedsLayout()
    }

    func setProgressColor(_ color: UIColor?) {
        progressColor = color
        applyProgressColors()
    }

    func setArtwork(_ image: UIImage?) {
        artworkButton.setImage(image, for: .normal)
        artworkButton.backgroundColor = image == nil ? .secondarySystemFill : .clear
    }

    func reset() {
        titleLabel.text = nil
        subtitleLabel.text = nil
        subtitleLabel.isHidden = true
        elapsedLabel.text = nil
        durationLabel.text = nil
        timeStack.isHidden = true
        isPlaying = false
        currentArtworkUrl = nil
        setArtwork(nil)
        setProgress(-1)
        updatePlayImage()
    }

    func setInlineLayout(_ inline: Bool) {
        guard inline != isInlineLayout else { return }
        isInlineLayout = inline
        subtitleLabel.isHidden = inline || subtitleLabel.text?.isEmpty != false
        titleLabel.font = inline
            ? .preferredFont(forTextStyle: .caption1)
            : .preferredFont(forTextStyle: .subheadline).withWeight(.semibold)
        artworkSize?.constant = inline ? Self.inlineArtwork : Self.regularArtwork
        stack.spacing = inline ? 8 : 10
        stackLeading?.constant = inline ? 14 : 16
        stackTrailing?.constant = inline ? -12 : -10
        stackTop?.constant = Self.minInset
        stackBottom?.constant = -Self.minInset
        artworkMax?.constant = -(Self.minInset * 2)
        var config = UIButton.Configuration.plain()
        let pad: CGFloat = inline ? 4 : 6
        config.contentInsets = NSDirectionalEdgeInsets(top: pad, leading: pad, bottom: pad, trailing: pad)
        playPauseButton.configuration = config
        updatePlayImage()
        invalidateIntrinsicContentSize()
        setNeedsLayout()
    }

    override var intrinsicContentSize: CGSize {
        let art = isInlineLayout ? Self.inlineArtwork : Self.regularArtwork
        return CGSize(width: UIView.noIntrinsicMetric, height: art + Self.minInset * 2)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = progressTrack.bounds.width * max(0, min(1, progress))
        progressFill.frame = CGRect(x: 0, y: 0, width: width, height: progressTrack.bounds.height)
        let size = min(artworkButton.bounds.width, artworkButton.bounds.height)
        if size > 0 {
            artworkButton.layer.cornerRadius = size * 0.22
        }
    }

    private func applyProgressColors() {
        if let progressColor {
            progressFill.backgroundColor = progressColor
            progressTrack.backgroundColor = progressColor.withAlphaComponent(0.22)
        } else {
            progressFill.backgroundColor = UIColor.label.withAlphaComponent(0.9)
            progressTrack.backgroundColor = UIColor.label.withAlphaComponent(0.18)
        }
    }

    private func updatePlayImage() {
        let name = isPlaying ? "pause.fill" : "play.fill"
        let symbol = UIImage.SymbolConfiguration(pointSize: isInlineLayout ? 14 : 16, weight: .semibold)
        playPauseButton.setImage(UIImage(systemName: name, withConfiguration: symbol), for: .normal)
    }

    @objc private func playPauseTapped() { onPlayPause?() }

    @objc private func artworkTapped() {
        if suppressNextTap {
            suppressNextTap = false
            return
        }
        onArtwork?()
    }

    @objc private func bodyTapped() {
        if suppressNextTap {
            suppressNextTap = false
            return
        }
        onTap?()
    }

    private func resetLift(animated: Bool) {
        let restore = {
            self.transform = .identity
            self.alpha = 1
        }
        if animated {
            UIView.animate(withDuration: 0.3, delay: 0, options: [.curveEaseOut, .beginFromCurrentState], animations: restore)
        } else {
            restore()
        }
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        let space = superview ?? self
        let translation = gesture.translation(in: space)
        switch gesture.state {
        case .changed:
            let y = min(0, translation.y)
            transform = CGAffineTransform(translationX: 0, y: y)
            let fadeDistance = max(bounds.height * 2, 120)
            alpha = max(0, 1 - abs(y) / fadeDistance)
            if y < -12 { suppressNextTap = true }
        case .ended, .cancelled:
            let velocity = gesture.velocity(in: space)
            let isUpwardSwipe = gesture.state == .ended
                && (translation.y < -Self.swipeUpThreshold || velocity.y < -280)
                && abs(translation.x) < Self.swipeMaxHorizontalDrift
            if isUpwardSwipe {
                suppressNextTap = true
                onTap?()
                resetLift(animated: false)
            } else {
                resetLift(animated: true)
            }
        default:
            break
        }
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        let playPoint = touch.location(in: playPauseButton)
        if playPauseButton.bounds.contains(playPoint) { return false }
        if gestureRecognizer is UITapGestureRecognizer {
            let artPoint = touch.location(in: artworkButton)
            if artworkButton.bounds.contains(artPoint) { return false }
        }
        return true
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }
}

@available(iOS 26.0, *)
enum ShellTabAccessory {
    static let kind = ShellComponent.tabAccessory
}

/// Shared UITabAccessory wiring for ordinary tabs and searchable tabs.
@available(iOS 26.0, *)
final class ShellTabAccessoryBinding {
    let content = ShellTabAccessoryContentView()
    var activate: ((String) -> Void)?
    private var playId = ""
    private var artworkId = ""
    private var tapId = ""
    private var artworkLoad: URLSessionDataTask?

    init() {
        content.onPlayPause = { [weak self] in
            guard let self, !self.playId.isEmpty else { return }
            self.activate?(self.playId)
        }
        content.onArtwork = { [weak self] in
            guard let self, !self.artworkId.isEmpty else { return }
            self.activate?(self.artworkId)
        }
        content.onTap = { [weak self] in
            guard let self, !self.tapId.isEmpty else { return }
            self.activate?(self.tapId)
        }
    }

    func apply(_ node: ShellControl?, on controller: UITabBarController) {
        guard let node else {
            playId = ""
            artworkId = ""
            tapId = ""
            artworkLoad?.cancel()
            content.reset()
            controller.setBottomAccessory(nil, animated: false)
            return
        }
        playId = node.items.first?.id ?? ""
        artworkId = node.items.dropFirst().first?.id ?? ""
        tapId = node.id
        content.apply(node)
        loadArtwork(node.artworkUrl)
        controller.setBottomAccessory(UITabAccessory(contentView: content), animated: false)
        content.setInlineLayout(controller.traitCollection.tabAccessoryEnvironment == .inline)
    }

    private func loadArtwork(_ urlString: String?) {
        guard let urlString, !urlString.isEmpty else {
            artworkLoad?.cancel()
            content.currentArtworkUrl = nil
            content.setArtwork(nil)
            return
        }
        if urlString == content.currentArtworkUrl, content.hasArtwork { return }
        content.currentArtworkUrl = urlString
        artworkLoad?.cancel()
        if urlString.hasPrefix("data:image"),
           let comma = urlString.firstIndex(of: ","),
           let data = Data(base64Encoded: String(urlString[urlString.index(after: comma)...])),
           let image = UIImage(data: data) {
            content.setArtwork(image)
            return
        }
        if urlString.hasPrefix("file://"), let url = URL(string: urlString) {
            content.setArtwork(UIImage(contentsOfFile: url.path))
            return
        }
        guard let url = URL(string: urlString) else { return }
        let task = URLSession.shared.dataTask(with: url) { [weak content] data, _, _ in
            let image = data.flatMap { UIImage(data: $0) }
            DispatchQueue.main.async {
                guard content?.currentArtworkUrl == urlString else { return }
                content?.setArtwork(image)
            }
        }
        artworkLoad = task
        task.resume()
    }
}

private extension UIFont {
    func withWeight(_ weight: UIFont.Weight) -> UIFont {
        let descriptor = fontDescriptor.addingAttributes([
            .traits: [UIFontDescriptor.TraitKey.weight: weight]
        ])
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}

extension UIColor {
    static func parseCSS(_ value: String?) -> UIColor? {
        guard let value, !value.isEmpty else { return nil }
        let numbers = value.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).compactMap(Double.init)
        if numbers.count >= 3 {
            return UIColor(
                red: numbers[0] / 255,
                green: numbers[1] / 255,
                blue: numbers[2] / 255,
                alpha: numbers.count > 3 ? numbers[3] : 1
            )
        }
        var hex = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard hex.hasPrefix("#"), hex.count == 7 else { return nil }
        hex.removeFirst()
        guard let int = UInt64(hex, radix: 16) else { return nil }
        return UIColor(
            red: CGFloat((int >> 16) & 0xff) / 255,
            green: CGFloat((int >> 8) & 0xff) / 255,
            blue: CGFloat(int & 0xff) / 255,
            alpha: 1
        )
    }
}
