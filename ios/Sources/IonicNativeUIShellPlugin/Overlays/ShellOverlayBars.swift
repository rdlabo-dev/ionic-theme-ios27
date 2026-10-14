import UIKit

extension ShellOverlayHost {
    /// The overlay owns its rail and revisions independently of the covered Capacitor page.
    @available(iOS 26.0, *)
    func updateBars(_ snapshot: ShellSnapshot, rendering: ShellRendering,
                    activate: @escaping (String, Int, Int) -> Void) -> [String] {
        guard snapshot.revision > projectionRevision else { return [] }
        projectionRevision = snapshot.revision
        let controls = snapshot.controls.filter {
            $0.placement == .verticalBars && [.button, .buttons, .backButton, .menuButton].contains($0.kind)
        }
        let retained = Set(controls.map(\.id))
        let rejected = snapshot.controls.filter { !retained.contains($0.id) }.map(\.id)
        guard !controls.isEmpty else {
            clearBars(revision: snapshot.revision)
            return rejected
        }
        let rail = verticalBars ?? ShellVerticalBarsController(
            activate: { [weak self] id in
                guard let self else { return }
                self.projectionSequence += 1
                activate(id, self.projectionRevision, self.projectionSequence)
            }, changed: { _, _, _, _, _ in 0 })
        verticalBars = rail
        rail.attach(to: self, in: view)
        rail.view.frame = view.bounds
        rail.apply(controls, rendering: rendering, edge: snapshot.verticalBarEdge ?? "right")
        return rejected
    }

    func clearBars(revision: Int) {
        guard revision >= projectionRevision else { return }
        projectionRevision = revision
        verticalBars?.detach()
        verticalBars = nil
    }
}
