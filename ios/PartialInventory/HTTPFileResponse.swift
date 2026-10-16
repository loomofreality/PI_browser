import Foundation

/// Small, independently testable HTTP core. No file outside the signed Website bundle is served.
struct HTTPFileResponse {
    var status: Int
    var headers: [String: String]
    var file: URL?
    var offset: UInt64 = 0
    var length: UInt64 = 0
    var sendBody = true

    static func make(request: String, root: URL, port: UInt16) -> Self {
        let lines = request.components(separatedBy: "\r\n")
        let words = (lines.first ?? "").split(separator: " ")
        guard words.count == 3, words[2] == "HTTP/1.1" || words[2] == "HTTP/1.0" else { return failure(400) }
        let method = String(words[0])
        guard method == "GET" || method == "HEAD" else { return failure(405) }
        var incoming: [String: String] = [:]
        for line in lines.dropFirst() where !line.isEmpty {
            guard let colon = line.firstIndex(of: ":") else { return failure(400) }
            let key = line[..<colon].lowercased()
            guard incoming[key] == nil else { return failure(400) }
            incoming[key] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard incoming["host"] == "127.0.0.1:\(port)" else { return failure(403) }
        if let origin = incoming["origin"], origin != "http://127.0.0.1:\(port)" { return failure(403) }
        if incoming["sec-fetch-site"] == "cross-site" { return failure(403) }
        let rawPath = String(words[1]).components(separatedBy: "?")[0]
        guard let decoded = rawPath.removingPercentEncoding,
              decoded.hasPrefix(AppConfiguration.sitePath),
              !decoded.contains("\\"), !decoded.contains("\0"),
              !decoded.split(separator: "/").contains("..") else { return failure(403) }
        var relative = String(decoded.dropFirst(AppConfiguration.sitePath.count))
        if relative.isEmpty || relative.hasSuffix("/") { relative += "index.html" }
        let resolvedRoot = root.resolvingSymlinksInPath().standardizedFileURL
        let file = resolvedRoot.appendingPathComponent(relative).resolvingSymlinksInPath().standardizedFileURL
        guard file.path.hasPrefix(resolvedRoot.path + "/"),
              let info = try? file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
              info.isRegularFile == true, let size = info.fileSize else { return failure(404) }
        var result = Self(status: 200, headers: ["Content-Type": mime(file.pathExtension), "Accept-Ranges": "bytes"], file: file,
                          length: UInt64(size), sendBody: method == "GET")
        if let range = incoming["range"] {
            guard let bounds = byteRange(range, size: UInt64(size)) else {
                var failed = failure(416); failed.headers["Content-Range"] = "bytes */\(size)"; return failed
            }
            result.status = 206; result.offset = bounds.lowerBound; result.length = bounds.upperBound - bounds.lowerBound + 1
            result.headers["Content-Range"] = "bytes \(bounds.lowerBound)-\(bounds.upperBound)/\(size)"
        }
        return result
    }

    static func byteRange(_ value: String, size: UInt64) -> ClosedRange<UInt64>? {
        guard size > 0, value.hasPrefix("bytes="), !value.contains(",") else { return nil }
        let pieces = value.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
        guard pieces.count == 2 else { return nil }
        if pieces[0].isEmpty {
            guard let suffix = UInt64(pieces[1]), suffix > 0 else { return nil }
            return (size - min(suffix, size))...(size - 1)
        }
        guard let first = UInt64(pieces[0]), first < size else { return nil }
        let last: UInt64
        if pieces[1].isEmpty { last = size - 1 }
        else { guard let parsed = UInt64(pieces[1]), parsed >= first else { return nil }; last = min(parsed, size - 1) }
        return first...last
    }

    static func failure(_ status: Int) -> Self { Self(status: status, headers: [:], file: nil) }
    var headerData: Data {
        let reasons = [200: "OK", 206: "Partial Content", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 416: "Range Not Satisfiable", 431: "Request Header Fields Too Large", 500: "Internal Server Error"]
        var fields = headers
        fields["Content-Length"] = String(length)
        fields["Connection"] = "close"
        fields["Cache-Control"] = "no-store"
        fields["X-Content-Type-Options"] = "nosniff"
        // Gzip files are raw compressed payloads. The existing reader decompresses them itself.
        fields["Content-Security-Policy"] = "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' blob:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'"
        return Data(("HTTP/1.1 \(status) \(reasons[status] ?? "Error")\r\n" + fields.sorted { $0.key < $1.key }.map { "\($0.key): \($0.value)\r\n" }.joined() + "\r\n").utf8)
    }
    static func mime(_ ext: String) -> String {
        ["html":"text/html; charset=utf-8", "js":"text/javascript; charset=utf-8", "mjs":"text/javascript; charset=utf-8",
         "css":"text/css; charset=utf-8", "json":"application/json", "gz":"application/gzip", "pdf":"application/pdf",
         "svg":"image/svg+xml", "png":"image/png", "jpg":"image/jpeg", "ttf":"font/ttf", "woff2":"font/woff2",
         "wasm":"application/wasm", "txt":"text/plain; charset=utf-8"][ext.lowercased()] ?? "application/octet-stream"
    }
}
