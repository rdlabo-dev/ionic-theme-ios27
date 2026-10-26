import XCTest
import WebKit
@testable import CapacitorNativeUIEngine

final class NativeUIScrollTrackerTests: XCTestCase {
    private func node(_ id: String = "counter", y: Double = 400) throws -> NativeUIScrollNode {
        let value: [String: Any] = ["id": id, "kind": "extension", "x": 10, "y": y + 80, "width": 240, "height": 60,
            "items": [], "dark": false, "rtl": false,
            "extension": ["name": "counter", "props": "{}", "actions": ["increment": "button"]],
            "scroll": ["id": "scroll", "offsetX": 0, "offsetY": 0, "viewport": ["x": 0, "y": 80, "width": 320, "height": 500],
                       "clip": ["x": 0, "y": 100, "width": 320, "height": 480],
                       "contentWidth": 320, "contentHeight": 1200,
                       "frame": ["x": 10, "y": y, "width": 240, "height": 60]]]
        return try JSONDecoder().decode(NativeUIScrollNode.self, from: JSONSerialization.data(withJSONObject: value))
    }

    @MainActor func testSharedScrollClippingAndTeardown() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let owner = UIViewController()
        window.rootViewController = owner
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let web = WKWebView(frame: window.bounds)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        owner.view.addSubview(web)
        let scroll = TrackingScrollView(frame: CGRect(x: 0, y: 80, width: 320, height: 500))
        scroll.contentSize = CGSize(width: 320, height: 1200)
        web.addSubview(scroll)
        let controller = NativeUIClippedView(content: UIView())
        owner.view.addSubview(controller)
        var updates = 0
        var frames: [String: CGRect] = [:]
        var tracker: NativeUIScrollTracker? = try XCTUnwrap(NativeUIScrollTracker(webView: web,
            nodes: [node(), node("second", y: 600)], scale: 1) { id, frame, clip in
                updates += 1
                frames[id] = frame
                if id == "counter" { controller.place(frame, clip: clip) }
            })
        tracker?.update()
        XCTAssertEqual(frames["counter"], CGRect(x: 10, y: 480, width: 240, height: 60))
        scroll.contentOffset.y = 420
        XCTAssertEqual(frames["counter"], CGRect(x: 10, y: 60, width: 240, height: 60))
        XCTAssertEqual(frames["second"], CGRect(x: 10, y: 260, width: 240, height: 60))
        XCTAssertEqual(controller.frame, CGRect(x: 10, y: 100, width: 240, height: 20))
        XCTAssertEqual(controller.content.frame, CGRect(x: 0, y: -40, width: 240, height: 60))
        XCTAssertNil(controller.hitTest(CGPoint(x: 5, y: -1), with: nil))
        scroll.moving = true
        XCTAssertTrue(try XCTUnwrap(tracker).replace([node(), node("second", y: 600)], webView: web, scale: 1))
        tracker?.update()
        XCTAssertEqual(frames["counter"]?.minY, 60, "Content updates must keep the original mapping during a gesture")
        scroll.moving = false
        // A delayed Web sample may arrive after dragging ends or during a JS
        // smooth scroll. Replacing content must not infer a new scroll origin.
        scroll.contentOffset.y = 430
        XCTAssertTrue(try XCTUnwrap(tracker).replace([node(), node("second", y: 600)], webView: web, scale: 1))
        tracker?.update()
        XCTAssertEqual(frames["counter"]?.minY, 50, "A delayed sample must not permanently shift native placement")
        scroll.contentOffset.y = 800
        XCTAssertTrue(controller.isHidden)
        scroll.contentOffset.y = 0
        XCTAssertFalse(controller.isHidden)
        tracker = nil
        let previous = updates
        scroll.contentOffset.y = 100
        XCTAssertEqual(updates, previous)
        let duplicate = UIScrollView(frame: scroll.frame)
        duplicate.contentSize = scroll.contentSize
        web.addSubview(duplicate)
        XCTAssertNil(NativeUIScrollTracker(webView: web, nodes: [try node()], scale: 1) { _, _, _ in })
    }

    @MainActor func testActualWebOverflowBinding() async throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let owner = UIViewController()
        window.rootViewController = owner
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let web = WKWebView(frame: window.bounds)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        owner.view.addSubview(web)
        web.loadHTMLString("""
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{margin:0}#scroll{position:absolute;top:80px;width:320px;height:500px;overflow:auto}#content{height:1200px}</style>
        <div id="scroll"><div id="content">Count</div></div>
        """, baseURL: nil)
        for _ in 0..<60 {
            if (try? await web.evaluateJavaScript("document.getElementById('scroll')?.clientHeight")) as? Int == 500 { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        var tracker: NativeUIScrollTracker?
        var actual: CGRect?
        for _ in 0..<40 {
            tracker = NativeUIScrollTracker(webView: web, nodes: [try node()], scale: 1) { _, frame, _ in actual = frame }
            if tracker != nil { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        let bound = try XCTUnwrap(tracker, "Must bind to actual WebKit overflow")
        bound.update()
        _ = try await web.evaluateJavaScript("document.getElementById('scroll').scrollTop = 150")
        for _ in 0..<40 {
            if actual?.minY == 330 { break }
            try await Task.sleep(nanoseconds: 25_000_000)
        }
        XCTAssertEqual(try XCTUnwrap(actual).minY, 330, accuracy: 0.5)
    }
    @MainActor func testActualHorizontalScrollDirections() async throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 320, height: 640))
        let owner = UIViewController()
        window.rootViewController = owner
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        let web = WKWebView(frame: window.bounds)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        owner.view.addSubview(web)
        for direction in ["ltr", "rtl"] {
            web.loadHTMLString("""
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{margin:0}#scroll{position:absolute;top:80px;width:300.5px;height:500px;border:.5px solid;overflow:auto;direction:\(direction)}#content{width:1200.25px;height:1200px}#source{width:240.25px;height:60px}</style>
            <div id="scroll"><div id="content"><div id="source">Count</div></div></div>
            """, baseURL: nil)
            try await Task.sleep(nanoseconds: 300_000_000)
            var value: Any?
            for _ in 0..<60 {
                value = try? await web.evaluateJavaScript("""
                (() => { const e=document.getElementById('source'), o=document.getElementById('scroll');
                if (!e || o.clientHeight !== 500 || getComputedStyle(o).direction !== '\(direction)') return null;
                const r=e.getBoundingClientRect(), b=o.getBoundingClientRect(), st=getComputedStyle(o);
                const l=parseFloat(st.borderLeftWidth), t=parseFloat(st.borderTopWidth);
                const v={x:b.x+l,y:b.y+t,width:b.width-l-parseFloat(st.borderRightWidth),height:b.height-t-parseFloat(st.borderBottomWidth)};
                return {id:'counter',kind:'extension',x:r.x,y:r.y,width:r.width,height:r.height,items:[],dark:false,rtl:false,
                  extension:{name:'counter',props:'{}',actions:{}},scroll:{id:'scroll',offsetX:o.scrollLeft,offsetY:o.scrollTop,viewport:{x:v.x,y:v.y,width:v.width,height:v.height},
                  clip:{x:v.x,y:v.y,width:v.width,height:v.height},contentWidth:o.scrollWidth,contentHeight:o.scrollHeight,
                  frame:{x:r.x-v.x+o.scrollLeft,y:r.y-v.y+o.scrollTop,width:r.width,height:r.height}}}; })()
                """)
                if value is [String: Any] { break }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            let data = try JSONSerialization.data(withJSONObject: XCTUnwrap(value as? [String: Any]))
            let node = try JSONDecoder().decode(NativeUIScrollNode.self, from: data)
            var actual: CGRect?
            var tracker: NativeUIScrollTracker?
            for _ in 0..<40 {
                tracker = NativeUIScrollTracker(webView: web, nodes: [node], scale: 1) { _, frame, _ in actual = frame }
                if tracker != nil { break }
                try await Task.sleep(nanoseconds: 50_000_000)
            }
            let bound = try XCTUnwrap(tracker)
            bound.update()
            XCTAssertEqual(try XCTUnwrap(actual).minX, node.scroll!.frame.x + node.scroll!.viewport.x - node.scroll!.offsetX, accuracy: 0.1, direction)
            _ = try await web.evaluateJavaScript("document.getElementById('scroll').scrollLeft = \(direction == "rtl" ? -150 : 150)")
            try await Task.sleep(nanoseconds: 200_000_000)
            let expected = try await web.evaluateJavaScript("document.getElementById('source').getBoundingClientRect().x") as! Double
            XCTAssertEqual(try XCTUnwrap(actual).minX, expected, accuracy: 0.1, direction)
        }
    }

}

private final class TrackingScrollView: UIScrollView {
    var moving = false
    override var isDragging: Bool { moving }
}
