import XCTest
final class ButtonCurveTests:XCTestCase {
 func testCurve() {
  let app=XCUIApplication();app.launch()
  XCTAssertTrue(app.buttons["Glass"].waitForExistence(timeout:20))
  Thread.sleep(forTimeInterval:2)
  for name in ["Glass","Prominent"] {
   app.buttons[name].tap();Thread.sleep(forTimeInterval:1)
   app.buttons[name].press(forDuration:0.7);Thread.sleep(forTimeInterval:1)
  }
 }
}
