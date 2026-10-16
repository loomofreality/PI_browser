import XCTest
@testable import PartialInventory

final class OfflineReaderTests: XCTestCase {
    func testNativeMenuDestinationsIncludeCatalogRoot() throws {
        for port in [9000, 54321] {
            let base = try XCTUnwrap(URL(string: "http://127.0.0.1:\(port)/PI_browser/"))
            let router = SiteRouter(localBase: base, publicBase: AppConfiguration.publicBase)
            // Catalog uses an empty path in the native book menu. This previously
            // force-unwrapped a nil URL and terminated the app on a real iPhone.
            XCTAssertEqual(router.page(""), base)
            XCTAssertEqual(router.publicURL(for: router.page("")), AppConfiguration.publicBase)
            for page in ["subjects.html", "volume-view.html", "study-guides/index.html", "bibliography.pdf", "pdf-volumes/volume-12.pdf"] {
                let local = router.page(page)
                XCTAssertEqual(local.absoluteString, base.absoluteString + page)
                XCTAssertTrue(router.isLocal(local))
                XCTAssertEqual(router.localURL(for: local), local)
            }
        }
    }

    func testLoopbackTransportAndPDFRange() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let content = Data("%PDF-1.7\nlocal fixture".utf8)
        try content.write(to: root.appendingPathComponent("volume.pdf"))
        let server = LocalSiteServer(root: root)
        defer { server.stop() }
        let base: URL = try await withCheckedThrowingContinuation { continuation in
            server.start(preferredPort: nil) { continuation.resume(with: $0) }
        }
        XCTAssertEqual(base.host, "127.0.0.1")
        var request = URLRequest(url: base.appendingPathComponent("volume.pdf"), timeoutInterval: 10)
        request.setValue("bytes=0-4", forHTTPHeaderField: "Range")
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = try XCTUnwrap(response as? HTTPURLResponse)
        XCTAssertEqual(http.statusCode, 206)
        XCTAssertEqual(http.value(forHTTPHeaderField: "Content-Range"), "bytes 0-4/\(content.count)")
        XCTAssertEqual(data, Data("%PDF-".utf8))
        request.httpMethod = "HEAD"
        request.setValue(nil, forHTTPHeaderField: "Range")
        let (headData, headResponse) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((headResponse as? HTTPURLResponse)?.statusCode, 200)
        XCTAssertEqual(headResponse.expectedContentLength, Int64(content.count))
        XCTAssertTrue(headData.isEmpty)
    }

    func testRangeBoundaries() {
        XCTAssertEqual(HTTPFileResponse.byteRange("bytes=0-3", size: 10), 0...3)
        XCTAssertEqual(HTTPFileResponse.byteRange("bytes=4-", size: 10), 4...9)
        XCTAssertEqual(HTTPFileResponse.byteRange("bytes=-3", size: 10), 7...9)
        XCTAssertEqual(HTTPFileResponse.byteRange("bytes=0-999", size: 10), 0...9)
        for range in ["bytes=10-", "bytes=-0", "bytes=3-2", "bytes=0-1,3-4", "bytes=a-b"] {
            XCTAssertNil(HTTPFileResponse.byteRange(range, size: 10))
        }
        XCTAssertNil(HTTPFileResponse.byteRange("bytes=0-", size: 0))
    }

    func testLocalFileSecurityAndRawGzip() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data([31,139,8,0]).write(to: root.appendingPathComponent("item.json.gz"))
        func request(_ target: String, method: String = "GET", extra: String = "") -> HTTPFileResponse {
            HTTPFileResponse.make(request: "\(method) \(target) HTTP/1.1\r\nHost: 127.0.0.1:9000\r\n\(extra)\r\n", root: root, port: 9000)
        }
        XCTAssertEqual(request("/PI_browser/item.json.gz").status, 200)
        XCTAssertEqual(request("/PI_browser/item.json.gz", method: "HEAD").sendBody, false)
        XCTAssertEqual(request("/PI_browser/item.json.gz", extra: "Range: bytes=1-2\r\n").length, 2)
        XCTAssertNil(request("/PI_browser/item.json.gz").headers["Content-Encoding"])
        for target in ["/PI_browser/../secret", "/PI_browser/%2e%2e/secret", "/PI_browser/x%5c..%5csecret", "/other/item.json.gz", "/PI_browser/%00"] {
            XCTAssertEqual(request(target).status, 403)
        }
        XCTAssertEqual(request("/PI_browser/item.json.gz", extra: "Origin: https://example.com\r\n").status, 403)
        XCTAssertEqual(request("/PI_browser/item.json.gz", extra: "Sec-Fetch-Site: cross-site\r\n").status, 403)
        XCTAssertEqual(request("/PI_browser/item.json.gz", method: "POST").status, 405)
        XCTAssertEqual(request("/PI_browser/missing").status, 404)
    }

    func testCanonicalLinksSurvivePortChanges() throws {
        let router = SiteRouter(localBase: URL(string:"http://127.0.0.1:9000/PI_browser/")!, publicBase: AppConfiguration.publicBase)
        let publicURL = URL(string:"https://portlandiator.github.io/PI_browser/?id=BH00001#p-en-3")!
        let local = try XCTUnwrap(router.localURL(for: publicURL))
        XCTAssertEqual(local.port, 9000)
        XCTAssertTrue(router.isLocal(router.localBase))
        XCTAssertEqual(router.publicURL(for: router.localBase), AppConfiguration.publicBase)
        XCTAssertEqual(router.publicURL(for: local), publicURL)
        XCTAssertNil(router.localURL(for: URL(string:"https://portlandiator.github.io.evil.test/PI_browser/")!))
        XCTAssertNil(router.localURL(for: URL(string:"https://portlandiator.github.io/PI_browser-evil/")!))
        XCTAssertNil(router.publicURL(for: URL(string:"http://127.0.0.1:9001/PI_browser/")!))
        XCTAssertNil(router.publicURL(for: URL(string:"http://127.0.0.1:9000/PI_browser-evil/")!))
        XCTAssertNil(router.publicURL(for: URL(string:"http://user@127.0.0.1:9000/PI_browser/")!))
    }

    @MainActor func testBookmarksPersistAndHistoryIsBounded() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("reading.json")
        let store = ReadingStore(file: file)
        let first = URL(string:"?id=BH00001",relativeTo:AppConfiguration.publicBase)!.absoluteURL
        store.toggleBookmark(url: first, title: "A reading")
        for i in 0..<105 { store.visit(url: URL(string:"?id=\(i)",relativeTo:AppConfiguration.publicBase)!.absoluteURL, title:"Reading \(i)") }
        let restored = ReadingStore(file: file)
        XCTAssertEqual(restored.state.bookmarks.first?.url, first)
        XCTAssertEqual(restored.state.history.count, 100)
        XCTAssertEqual(restored.state.history.first?.title, "Reading 104")
        restored.clearHistory()
        XCTAssertEqual(ReadingStore(file:file).state.bookmarks.count, 1)
    }

    func testSeparatePDFHostingSharesAWorkingPublicLink() throws {
        let router = SiteRouter(localBase: URL(string:"http://127.0.0.1:9000/PI_browser/")!, publicBase: AppConfiguration.publicBase, pdfPublicBase: URL(string:"https://loomofreality.github.io/PI_volumes/")!)
        let local = URL(string:"http://127.0.0.1:9000/PI_browser/pdf-volumes/volume-12.pdf#page=5")!
        let publicURL = try XCTUnwrap(router.publicURL(for:local))
        XCTAssertEqual(publicURL.absoluteString,"https://loomofreality.github.io/PI_volumes/pdf-volumes/volume-12.pdf#page=5")
        XCTAssertEqual(router.localURL(for:publicURL),local)
        XCTAssertNil(router.localURL(for: URL(string:"https://loomofreality.github.io/PI_volumes-evil/pdf-volumes/volume-12.pdf")!))
        XCTAssertEqual(router.publicURL(for:router.page("bibliography.pdf")),AppConfiguration.bibliography)
        XCTAssertEqual(router.localURL(for:AppConfiguration.bibliography),router.page("bibliography.pdf"))
    }

    func testBundledCollectionHasEveryVolume() throws {
        let root = try XCTUnwrap(Bundle.main.url(forResource:"Website",withExtension:nil))
        let version = try CollectionVersion.bundled(in: root)
        XCTAssertGreaterThan(version.records, 29000)
        XCTAssertGreaterThan(version.subjects, 0)
        let volumes = try JSONDecoder().decode([String:String].self, from: Data(contentsOf:root.appendingPathComponent("volumes.json")))
        XCTAssertEqual(volumes.count, version.volumes)
        for file in volumes.values { XCTAssertTrue(FileManager.default.fileExists(atPath:root.appendingPathComponent(file).path), file) }
    }
}
