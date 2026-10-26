import XCTest
import UIKit
@testable import CapacitorNativeUIEngine

final class NativeUICoveredSnapshotsTests: XCTestCase {
    @MainActor func testMovingModalCaptureAndReturnDoNotReplaceBackgroundOwnership() async throws {
        let owner = UIViewController()
        let window = SnapshotTestWindow(frame: UIScreen.main.bounds)
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let view = owner.view!
        view.frame = window.bounds
        window.layoutIfNeeded()
        let snapshots = NativeUICoveredSnapshots(snapshotView: { $0 })
        defer { snapshots.reset(); window.isHidden = true }
        func capture(_ id: String) async -> [String: Any] {
            await withCheckedContinuation { continuation in
                snapshots.prepare(frames: { [id: CGRect(x: 20, y: 80, width: 48, height: 48)] },
                                  in: view, viewportWidth: view.bounds.width) { continuation.resume(returning: $0) }
            }
        }
        let backCapture = await capture("back")
        let background = try XCTUnwrap(backCapture["token"] as? String)
        XCTAssertTrue(snapshots.cover(background, in: view, views: []))
        let modalCapture = await capture("modal")
        let foreground = try XCTUnwrap(modalCapture["token"] as? String)
        XCTAssertTrue(snapshots.cover(foreground, in: view, views: [], transient: true))
        XCTAssertEqual(snapshots.coveringToken, background)
        snapshots.retireCopy(foreground)
        let destination = CGRect(x: 8, y: 320, width: 72, height: 72)
        XCTAssertTrue(snapshots.restore(in: view, token: foreground, frames: ["modal": destination]))
        snapshots.retireCopy(foreground)
        let returned = try XCTUnwrap(window.subviews.compactMap { $0 as? UIImageView }.first)
        XCTAssertEqual(returned.frame, view.convert(destination, to: window))
        snapshots.retireCopy(foreground, entry: false)
        XCTAssertNil(returned.superview)
        XCTAssertEqual(snapshots.identifiers(for: foreground), ["modal"], "Retiring a return copy must preserve its reusable capture")
        XCTAssertTrue(snapshots.cover(foreground, in: view, views: [], transient: true))
        snapshots.retireCopy(foreground, entry: false)
        XCTAssertFalse(window.subviews.compactMap { $0 as? UIImageView }.isEmpty, "An old return acknowledgement cannot remove a new entry copy")
        snapshots.release(foreground)
        XCTAssertTrue(window.subviews.compactMap { $0 as? UIImageView }.isEmpty)
        XCTAssertEqual(snapshots.coveringToken, background)
        XCTAssertEqual(snapshots.identifiers(for: background), ["back"])
    }

    @MainActor func testCoverHidesOnlyItsViewsAndOldReturnTimerCannotOrphanNewCopy() async throws {
        let owner = UIViewController()
        let window = SnapshotTestWindow(frame: UIScreen.main.bounds)
        window.rootViewController = owner
        window.makeKeyAndVisible()
        let view = owner.view!
        view.backgroundColor = .white
        view.frame = window.bounds
        window.layoutIfNeeded()
        let snapshots = NativeUICoveredSnapshots(snapshotView: { $0 })
        defer { snapshots.reset(); window.isHidden = true }
        let capture: [String: Any] = await withCheckedContinuation { continuation in
            snapshots.prepare(frames: { ["button": CGRect(x: 20, y: 80, width: 60, height: 44)] },
                              in: view, viewportWidth: view.bounds.width) { continuation.resume(returning: $0) }
        }
        let token = try XCTUnwrap(capture["token"] as? String)
        let visible = UIView(), hidden = UIView()
        hidden.isHidden = true
        XCTAssertFalse(snapshots.cover("missing", in: view, views: [visible]))
        XCTAssertFalse(visible.isHidden, "Failed cover must not mutate visibility")
        XCTAssertTrue(snapshots.cover(token, in: view, views: [visible, hidden]))
        XCTAssertTrue(visible.isHidden)
        XCTAssertTrue(hidden.isHidden)
        snapshots.release("stale-token")
        XCTAssertTrue(visible.isHidden)
        XCTAssertFalse(window.subviews.compactMap { $0 as? UIImageView }.isEmpty)
        snapshots.retireCopy("stale-token")
        XCTAssertFalse(window.subviews.compactMap { $0 as? UIImageView }.isEmpty)
        snapshots.retireCopy(token)
        XCTAssertTrue(window.subviews.compactMap { $0 as? UIImageView }.isEmpty)
        XCTAssertTrue(snapshots.restore(in: view))
        snapshots.finishCovering()
        snapshots.retireCopy(token)
        XCTAssertFalse(window.subviews.compactMap { $0 as? UIImageView }.isEmpty,
                       "A delayed entry acknowledgement must not remove the return copy")
        snapshots.cover(token, in: view, views: [visible, hidden])
        // A second return copy must not be retired by the first copy's timer.
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertTrue(snapshots.restore(in: view))
        let returned = try XCTUnwrap(window.subviews.compactMap { $0 as? UIImageView }.first)
        XCTAssertTrue(returned.superview === window)
        try await Task.sleep(nanoseconds: 250_000_000)
        XCTAssertTrue(returned.superview === window)
        snapshots.restoreControls()
        XCTAssertFalse(visible.isHidden)
        XCTAssertTrue(hidden.isHidden)
        visible.isHidden = true // A normal native update now owns visibility.
        snapshots.release(token)
        XCTAssertTrue(visible.isHidden)
        XCTAssertNil(returned.superview, "An old timer must not orphan the newer copy")
        XCTAssertTrue(window.subviews.compactMap { $0 as? UIImageView }.isEmpty)
    }
}

// Swift package tests have no hosted application scene. Supply deterministic
// pixels here; actual UIKit capture is exercised by the simulator handoff test.
final class SnapshotTestWindow: UIWindow {
    override func drawHierarchy(in rect: CGRect, afterScreenUpdates: Bool) -> Bool {
        UIColor.white.setFill()
        UIRectFill(rect)
        return true
    }
}
