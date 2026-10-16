import Foundation

enum AppConfiguration {
    static let publicBase = URL(string: "https://portlandiator.github.io/PI_browser/")!
    static let sitePath = "/PI_browser/"
    static let bibliography = URL(string: "https://github.com/portlandiator/PI_browser/raw/refs/heads/main/docs/Bibliography%2C%20Source%20Codes%20and%20Subject%20Schema.pdf")!
    static var storeURL: URL? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "AppStoreURL") as? String,
              value.hasPrefix("https://apps.apple.com/") else { return nil }
        return URL(string: value)
    }
}

struct CollectionVersion: Codable {
    let format: Int
    let commit: String
    let dataset: String
    let records: Int
    let subjects: Int
    let studyGuides: Int
    let volumes: Int
    let bytes: Int64
    let builtAt: String
    let pdfPublicBase: String?

    static func bundled(in root: URL) throws -> Self {
        try JSONDecoder().decode(Self.self, from: Data(contentsOf: root.appendingPathComponent("offline-version.json")))
    }
}

/// Persistent and shared URLs never contain the private loopback port.
struct SiteRouter {
    let localBase: URL
    let publicBase: URL
    var pdfPublicBase: URL? = nil

    // URL.path can omit a directory URL's trailing slash on Apple platforms.
    // URLComponents preserves it, which is essential for roots and path boundaries.
    private func urlPath(_ url: URL) -> String {
        URLComponents(url: url, resolvingAgainstBaseURL: true)?.path ?? ""
    }

    func isLocal(_ url: URL) -> Bool {
        url.scheme == "http" && url.host == "127.0.0.1" && url.port == localBase.port &&
        url.user == nil && url.password == nil && urlPath(url).hasPrefix(AppConfiguration.sitePath)
    }

    func localURL(for url: URL) -> URL? {
        if isLocal(url) { return url }
        if url == AppConfiguration.bibliography { return page("bibliography.pdf") }
        if let pdfPublicBase, url.scheme == "https", url.host == pdfPublicBase.host,
           url.port == nil, url.user == nil, url.password == nil, urlPath(url).hasPrefix(urlPath(pdfPublicBase)) {
            let relative = String(urlPath(url).dropFirst(urlPath(pdfPublicBase).count))
            if relative.range(of: "^pdf-volumes/volume-[0-9]+\\.pdf$", options: .regularExpression) != nil {
                var parts = URLComponents(url: page(relative), resolvingAgainstBaseURL: false)!
                parts.query = url.query; parts.fragment = url.fragment; return parts.url
            }
        }
        guard url.scheme == "https", url.host == publicBase.host, url.port == nil,
              url.user == nil, url.password == nil,
              urlPath(url).hasPrefix(urlPath(publicBase)) else { return nil }
        var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        parts.scheme = localBase.scheme; parts.host = localBase.host; parts.port = localBase.port
        return parts.url
    }

    func publicURL(for url: URL) -> URL? {
        guard isLocal(url) else { return nil }
        if urlPath(url) == AppConfiguration.sitePath + "bibliography.pdf" { return AppConfiguration.bibliography }
        if let pdfPublicBase, urlPath(url).hasPrefix(AppConfiguration.sitePath + "pdf-volumes/") {
            let relative = String(urlPath(url).dropFirst(AppConfiguration.sitePath.count))
            var parts = URLComponents(url: pdfPublicBase.appendingPathComponent(relative), resolvingAgainstBaseURL: false)!
            parts.query = url.query; parts.fragment = url.fragment; return parts.url
        }
        var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        parts.scheme = publicBase.scheme; parts.host = publicBase.host; parts.port = publicBase.port
        return parts.url
    }

    func page(_ relative: String) -> URL {
        // Menu destinations are bundle paths. Foundation can reject an empty
        // relative URL on iOS; Catalog must use the already validated root.
        relative.isEmpty ? localBase : localBase.appendingPathComponent(relative)
    }
}
