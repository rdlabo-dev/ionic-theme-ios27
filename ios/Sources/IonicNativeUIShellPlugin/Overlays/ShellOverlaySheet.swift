import UIKit

extension ShellOverlayHost {
    func configureSheet() {
        guard #available(iOS 16.0, *), let options,
              let kind = options["kind"] as? String, kind == "card" || kind == "sheet",
              let sheet = sheetPresentationController else { return }
        sheet.delegate = self
        if kind == "card" {
            // Leave Ionic's card gap open so the shrunken page peeks above the sheet.
            let gap = CGFloat(options["topInset"] as? Double ?? 40)
            sheet.detents = [.custom { context in max(context.maximumDetentValue - gap, 1) }]
            return
        }
        let breakpoints = (options["breakpoints"] as? [Double] ?? []).filter { $0 > 0 }.sorted()
        sheet.detents = breakpoints.map { value in
            .custom(identifier: .init(String(value))) { context in context.maximumDetentValue * CGFloat(value) }
        }
        if let initial = options["initialBreakpoint"] as? Double {
            sheet.selectedDetentIdentifier = .init(String(initial))
        }
        if let threshold = options["backdropBreakpoint"] as? Double,
           let undimmed = breakpoints.last(where: { $0 <= threshold }) {
            sheet.largestUndimmedDetentIdentifier = .init(String(undimmed))
        }
        sheet.prefersScrollingExpandsWhenScrolledToEdge = options["expandToScroll"] as? Bool ?? true
        sheet.prefersGrabberVisible = options["handle"] as? Bool ?? true
    }

    func setBreakpoint(_ value: Double) {
        guard #available(iOS 16.0, *), let sheet = sheetPresentationController else { return }
        let identifier = UISheetPresentationController.Detent.Identifier(String(value))
        guard sheet.detents.contains(where: { $0.identifier == identifier }), sheet.selectedDetentIdentifier != identifier else { return }
        sheet.animateChanges { sheet.selectedDetentIdentifier = identifier }
    }
}
