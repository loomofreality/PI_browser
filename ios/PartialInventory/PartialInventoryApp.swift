import SwiftUI
import WebKit
import SafariServices
import UIKit

@main @MainActor struct PartialInventoryApp: App {
    @StateObject private var store: ReadingStore
    @StateObject private var browser: BrowserModel
    init() {
        let store = ReadingStore()
        _store = StateObject(wrappedValue: store)
        _browser = StateObject(wrappedValue: BrowserModel(store: store))
    }
    var body: some Scene {
        WindowGroup { ReaderView(browser: browser, store: store).tint(Color(red: 0.20, green: 0.40, blue: 0.32)) }
    }
}

private struct ReaderView: View {
    @ObservedObject var browser: BrowserModel
    @ObservedObject var store: ReadingStore
    @State private var showingLibrary = false
    @State private var showingCollection = false
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if browser.loading { ProgressView().progressViewStyle(.linear).accessibilityLabel("Opening page") }
                if let error = browser.errorMessage {
                    VStack(spacing: 12) {
                        Label("Reader unavailable", systemImage: "book.closed")
                        Text(error).font(.callout)
                        Button("Try again") { browser.reload() }.buttonStyle(.borderedProminent)
                    }.padding()
                }
                WebSurface(webView: browser.webView)
                    .overlay { if !browser.ready && browser.errorMessage == nil { ProgressView("Opening your offline collection…") } }
            }
            .navigationTitle("PI Browser")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("Catalog", systemImage: "text.magnifyingglass") { browser.section("") }
                        Button("Subjects", systemImage: "point.3.connected.trianglepath.dotted") { browser.section("subjects.html") }
                        Button("Volumes", systemImage: "books.vertical") { browser.section("volume-view.html") }
                        Button("Study guides", systemImage: "book.pages") { browser.section("study-guides/index.html") }
                    } label: { Image(systemName: "books.vertical").accessibilityLabel("Browse collection") }
                    .disabled(!browser.ready)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Find on page", systemImage: "magnifyingglass") { browser.find() }
                        Button("Print or save PDF", systemImage: "printer") { browser.printPage() }
                        Button("Collection and updates", systemImage: "info.circle") { showingCollection = true }
                    } label: { Image(systemName: "ellipsis.circle").accessibilityLabel("Reader options") }
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left") }.disabled(!browser.canGoBack).accessibilityLabel("Back")
                    Button { browser.webView.goForward() } label: { Image(systemName: "chevron.right") }.disabled(!browser.canGoForward).accessibilityLabel("Forward")
                    Spacer()
                    Button { browser.bookmark() } label: {
                        Image(systemName: store.state.bookmarks.contains(where: { $0.url == browser.currentPublicURL }) ? "bookmark.fill" : "bookmark")
                    }.disabled(browser.currentPublicURL == nil).accessibilityLabel("Toggle bookmark")
                    Spacer()
                    Button { showingLibrary = true } label: { Image(systemName: "list.bullet.rectangle") }.accessibilityLabel("Bookmarks and history")
                    Button { browser.share() } label: { Image(systemName: "square.and.arrow.up") }.disabled(browser.currentPublicURL == nil).accessibilityLabel("Share reading link")
                }
            }
            .task { browser.start() }
            .sheet(isPresented: $showingLibrary) { ReadingLibrary(store: store) { browser.open($0); showingLibrary = false } }
            .sheet(isPresented: $showingCollection) { CollectionView(browser: browser) }
            .sheet(item: $browser.externalPage) { SafariSurface(url: $0.url).ignoresSafeArea() }
            .sheet(item: $browser.sharedItems) { ShareSurface(items: $0.items) }
            .alert("Saved reading", isPresented: Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })) {
                Button("OK") { store.errorMessage = nil }
            } message: { Text(store.errorMessage ?? "") }
        }
    }
}

private struct ReadingLibrary: View {
    @ObservedObject var store: ReadingStore
    let open: (URL) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var history = false
    @State private var search = ""
    var readings: [SavedReading] {
        (history ? store.state.history : store.state.bookmarks).filter { search.isEmpty || $0.title.localizedCaseInsensitiveContains(search) || $0.url.absoluteString.localizedCaseInsensitiveContains(search) }
    }
    var body: some View {
        NavigationStack {
            List {
                Picker("Reading list", selection: $history) { Text("Bookmarks").tag(false); Text("History").tag(true) }.pickerStyle(.segmented)
                if readings.isEmpty { Text(history ? "Pages you read appear here." : "Use the bookmark button to save your place.").foregroundStyle(.secondary) }
                ForEach(readings) { reading in
                    Button { open(reading.url) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(reading.title).foregroundStyle(.primary)
                            Text(reading.url.query ?? reading.url.lastPathComponent).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }.swipeActions { if !history { Button("Delete", role: .destructive) { store.deleteBookmark(reading.id) } } }
                }
            }
            .searchable(text: $search)
            .navigationTitle("Your reading")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .bottomBar) { if history { Button("Clear history", role: .destructive) { store.clearHistory() } } }
            }
        }
    }
}

private struct CollectionView: View {
    @ObservedObject var browser: BrowserModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section("Available offline") {
                    if let v = browser.version {
                        LabeledContent("Texts", value: v.records.formatted())
                        LabeledContent("Subjects", value: v.subjects.formatted())
                        LabeledContent("Study guides", value: v.studyGuides.formatted())
                        LabeledContent("Volume PDFs", value: v.volumes.formatted())
                        LabeledContent("Collection size", value: ByteCountFormatter.string(fromByteCount: v.bytes, countStyle: .file))
                        LabeledContent("Website release", value: String(v.commit.prefix(10)))
                    }
                    Text("Search, bilingual texts, subjects, study guides, and every included volume PDF work in Airplane Mode. External references open in Safari and require a connection.").font(.footnote)
                }
                Section("Updates") {
                    Text(browser.updateMessage)
                    Button { Task { await browser.checkForUpdate() } } label: {
                        if browser.checkingUpdate { ProgressView() } else { Text("Check website release") }
                    }.disabled(browser.checkingUpdate)
                    if let url = AppConfiguration.storeURL { Link("Open App Store", destination: url) }
                    Text("New website releases are packaged into app updates. During beta testing, install updates in TestFlight. App updates keep your bookmarks and replace the complete collection together.").font(.footnote)
                }
                Section("Privacy") {
                    Text("Bookmarks and the last 100 visited pages stay on this device. The reader sends no analytics. Checking for updates contacts the website host; opening an external reference uses Safari.").font(.footnote)
                }
            }.navigationTitle("Collection").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct WebSurface: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
private struct SafariSurface: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
private struct ShareSurface: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
