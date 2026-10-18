import XCTest

/// Captures App Store screenshots. Skipped unless the test runner receives SCREENSHOT_DIR
/// (set TEST_RUNNER_SCREENSHOT_DIR when running xcodebuild); see .github/workflows/ios-screenshots.yml.
final class AppStoreScreenshots: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        guard let path = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"], !path.isEmpty else {
            throw XCTSkip("Set TEST_RUNNER_SCREENSHOT_DIR to capture App Store screenshots.")
        }
        continueAfterFailure = false
        directory = URL(fileURLWithPath: path, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    // Each page is opened directly with the Debug-only -PIStartPage launch argument.
    func testCaptureStoreScreenshots() throws {
        for (name, page, wait) in [
            ("01-reader", "./?id=BH00005#p-en-1", "← Back to collection"),
            ("02-catalog-search", "./?q=physician", nil),
            ("03-subject-graph", "subjects.html?subject=4C00027D22054CDE8AACBF0F817122C2#subject-content", nil),
            ("04-volume", "volume-view.html?volume=1&page=3", nil),
            ("05-study-guide", "study-guides/divinephysician.html", nil),
        ] as [(String, String, String?)] {
            let app = launch(page)
            if let wait { XCTAssertTrue(app.webViews.buttons[wait].firstMatch.waitForExistence(timeout: 60), name) }
            settle(app)
            capture(name)
            app.terminate()
        }

        let app = launch("./")
        settle(app)
        app.buttons["Reader options"].tap()
        app.buttons["Collection and updates"].tap()
        XCTAssertTrue(app.staticTexts["Available offline"].waitForExistence(timeout: 10))
        sleep(1)
        capture("06-offline-collection")
    }

    private func launch(_ page: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-PIStartPage", page]
        app.launch()
        let browse = app.buttons["Browse collection"]
        XCTAssertTrue(browse.waitForExistence(timeout: 60))
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: browse)], timeout: 60), .completed)
        return app
    }

    /// Waits for the page load indicator to clear, then gives search workers, the graph and PDF.js time to draw.
    private func settle(_ app: XCUIApplication) {
        let loading = app.progressIndicators["Opening page"]
        _ = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: loading)], timeout: 60)
        sleep(8)
    }

    private func capture(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
        XCTAssertNoThrow(try screenshot.pngRepresentation.write(to: directory.appendingPathComponent(name + ".png")))
    }
}
