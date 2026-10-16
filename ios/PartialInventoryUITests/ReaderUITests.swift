import XCTest

final class ReaderUITests: XCTestCase {
    func testCatalogBookmarksAndCollection() throws {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout:30))
        let search = app.webViews.textFields.matching(NSPredicate(format:"placeholderValue CONTAINS 'Search words'")).firstMatch
        XCTAssertTrue(search.waitForExistence(timeout:30))
        search.tap(); search.typeText("BH00001\n")
        let result = app.webViews.links.matching(NSPredicate(format:"label CONTAINS %@", "BH00001")).firstMatch
        if result.waitForExistence(timeout:15) { result.tap() }
        // Exact-ID lookup must open an actual source, not only display the query text.
        let back = app.webViews.buttons["← Back to collection"]
        XCTAssertTrue(back.waitForExistence(timeout:30))
        app.buttons["Toggle bookmark"].tap()
        app.buttons["Bookmarks and history"].tap()
        XCTAssertTrue(app.navigationBars["Your reading"].waitForExistence(timeout:5))
        app.buttons["Done"].tap()
        app.buttons["Reader options"].tap()
        app.buttons["Collection and updates"].tap()
        XCTAssertTrue(app.staticTexts["Available offline"].waitForExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["Volume PDFs"].exists)
        let screenshot = XCTAttachment(screenshot:app.screenshot()); screenshot.lifetime = .keepAlways; add(screenshot)
    }
}
