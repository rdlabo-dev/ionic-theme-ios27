import XCTest
final class RangeProbeTests: XCTestCase {
 func testDrag() {
  let app=XCUIApplication(bundleIdentifier:"dev.rdlabo.rangeprobe");app.launch()
  let slider=app.sliders["slider-0"];XCTAssertTrue(slider.waitForExistence(timeout:15))
  print("SLIDER \(slider.frame)")
  let mid=slider.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5))
  mid.press(forDuration:2,thenDragTo:slider.coordinate(withNormalizedOffset:CGVector(dx:0.95,dy:0.5)),withVelocity:.slow,thenHoldForDuration:2)
  slider.coordinate(withNormalizedOffset:CGVector(dx:0.95,dy:0.5)).press(forDuration:1,thenDragTo:slider.coordinate(withNormalizedOffset:CGVector(dx:0,dy:0.5)),withVelocity:.slow,thenHoldForDuration:2)
 }
 func testWebDrag() {
  let app=XCUIApplication(bundleIdentifier:"io.ionic.theme.ios27");app.launch()
  let sliders=app.webViews.sliders
  XCTAssertTrue(sliders.firstMatch.waitForExistence(timeout:20))
  print(app.debugDescription)
  let slider=sliders.element(boundBy:0)
  let before=slider.value as? String
  slider.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:2,thenDragTo:slider.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).withOffset(CGVector(dx:180,dy:0)),withVelocity:.slow,thenHoldForDuration:2)
  XCTAssertNotEqual(before,slider.value as? String)
  let dual=sliders.element(boundBy:1)
  let dualBefore=dual.value as? String
  dual.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:1,thenDragTo:dual.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).withOffset(CGVector(dx:340,dy:0)),withVelocity:.slow,thenHoldForDuration:2)
  XCTAssertNotEqual(dualBefore,dual.value as? String)
  app.buttons["Toggle dark"].tap()
  slider.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:1,thenDragTo:slider.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).withOffset(CGVector(dx:-180,dy:0)),withVelocity:.slow,thenHoldForDuration:2)
 }
 func testGreenDrag() {
 let app=XCUIApplication(bundleIdentifier:"dev.rdlabo.rangeprobe");app.launch()
 let slider=app.sliders["slider-1"];XCTAssertTrue(slider.waitForExistence(timeout:15))
 slider.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.5)).press(forDuration:2,thenDragTo:slider.coordinate(withNormalizedOffset:CGVector(dx:0.8,dy:0.5)),withVelocity:.slow,thenHoldForDuration:3)
 }
}
