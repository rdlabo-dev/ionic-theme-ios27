import XCTest
final class ButtonPressTests: XCTestCase {
 func testPress() {
  let app=XCUIApplication();app.launch()
  XCTAssertTrue(app.webViews.buttons["Single"].waitForExistence(timeout:20))
  Thread.sleep(forTimeInterval:2)
  app.webViews.buttons["Single"].tap()
  Thread.sleep(forTimeInterval:1.5)
  for name in ["Single", "Group", "Prominent"] {
   let button=app.webViews.buttons[name]
   button.tap();Thread.sleep(forTimeInterval:0.9)
   button.press(forDuration:0.7);Thread.sleep(forTimeInterval:0.9)
  }
  XCTAssertTrue(app.staticTexts["Recorded 7"].exists)
  let shot=XCTAttachment(screenshot:XCUIScreen.main.screenshot());shot.lifetime = .keepAlways;add(shot)
 }
}
