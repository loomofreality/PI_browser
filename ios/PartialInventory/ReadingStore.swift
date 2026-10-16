import Foundation
import Combine

struct SavedReading: Codable, Identifiable, Equatable {
    var id: String { url.absoluteString }
    let url: URL
    var title: String
    var visitedAt: Date
}

struct ReadingState: Codable {
    var bookmarks: [SavedReading] = []
    var history: [SavedReading] = []
    var lastURL: URL?
    var serverPort: UInt16?
}

@MainActor final class ReadingStore: ObservableObject {
    @Published private(set) var state = ReadingState()
    @Published var errorMessage: String?
    private let file: URL
    private var writable = true

    init(file: URL? = nil) {
        self.file = file ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("PartialInventory/reading.json")
        do {
            if FileManager.default.fileExists(atPath: self.file.path) {
                state = try JSONDecoder().decode(ReadingState.self, from: Data(contentsOf: self.file))
            }
        } catch {
            writable = false
            errorMessage = "Saved reading data could not be opened. The original file has been preserved. \(error.localizedDescription)"
        }
    }

    func rememberPort(_ port: UInt16) { state.serverPort = port; persist() }
    func visit(url: URL, title: String) {
        // The caller supplies only canonical URLs accepted by SiteRouter, including hosted PDFs.
        guard url.scheme == "https", url.user == nil, url.password == nil else { return }
        state.lastURL = url
        state.history.removeAll { $0.url == url }
        state.history.insert(SavedReading(url: url, title: title, visitedAt: Date()), at: 0)
        state.history = Array(state.history.prefix(100))
        persist()
    }
    func toggleBookmark(url: URL, title: String) {
        if state.bookmarks.contains(where: { $0.url == url }) { state.bookmarks.removeAll { $0.url == url } }
        else { state.bookmarks.insert(SavedReading(url: url, title: title, visitedAt: Date()), at: 0) }
        persist()
    }
    func deleteBookmark(_ id: String) { state.bookmarks.removeAll { $0.id == id }; persist() }
    func clearHistory() { state.history = []; state.lastURL = nil; persist() }

    private func persist() {
        guard writable else { return }
        do {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(state).write(to: file, options: .atomic)
        } catch { errorMessage = "Your reading changes could not be saved: \(error.localizedDescription)" }
    }
}
