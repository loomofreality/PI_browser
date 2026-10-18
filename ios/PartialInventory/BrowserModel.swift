import Foundation
import SwiftUI
import WebKit
import UIKit

struct ExternalPage: Identifiable { let id = UUID(); let url: URL }
struct SharedItems: Identifiable { let id = UUID(); let items: [Any] }

@MainActor final class BrowserModel: NSObject, ObservableObject {
    @Published var ready = false
    @Published var loading = false
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var title = "Partial Inventory"
    @Published var currentPublicURL: URL?
    @Published var errorMessage: String?
    @Published var externalPage: ExternalPage?
    @Published var sharedItems: SharedItems?
    @Published var version: CollectionVersion?
    @Published var updateMessage = "Check whether the website has a newer collection."
    @Published var checkingUpdate = false
    let store: ReadingStore
    let webView: WKWebView
    private var server: LocalSiteServer?
    private var router: SiteRouter?
    private var observations: [NSKeyValueObservation] = []
    private var starting = false

    init(store: ReadingStore) {
        self.store = store
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        configuration.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.97, green: 0.96, blue: 0.94, alpha: 1)
        configuration.userContentController.add(WeakScriptHandler(self), name: "inventory")
        configuration.userContentController.addUserScript(WKUserScript(source: Self.bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        observations = [
            webView.observe(\.isLoading, options: [.new]) { [weak self] _, _ in Task { @MainActor in self?.refreshNavigation() } },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in Task { @MainActor in self?.refreshNavigation() } },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] _, _ in Task { @MainActor in self?.refreshNavigation() } }
        ]
    }

    func start() {
        guard !ready, !starting else { return }; starting = true; errorMessage = nil
        guard let root = Bundle.main.url(forResource: "Website", withExtension: nil) else {
            starting = false; errorMessage = "The offline collection is missing from this build. Run the website packaging step before building the app."; return
        }
        do { version = try CollectionVersion.bundled(in: root) }
        catch { starting = false; errorMessage = "The bundled collection could not be verified: \(error.localizedDescription)"; return }
        let service = LocalSiteServer(root: root); server = service
        service.start(preferredPort: store.state.serverPort) { [weak self] result in
            Task { @MainActor in
                guard let self else { return }; self.starting = false
                switch result {
                case .success(let base):
                    let pdfBase = self.version.flatMap { $0.pdfPublicBase }.flatMap { URL(string: $0) }
                    self.router = SiteRouter(localBase: base, publicBase: AppConfiguration.publicBase, pdfPublicBase: pdfBase)
                    self.store.rememberPort(UInt16(base.port!)); self.ready = true
                    self.open(Self.launchPage ?? self.store.state.lastURL ?? AppConfiguration.publicBase)
                case .failure(let error): self.errorMessage = "The offline reader could not start: \(error.localizedDescription)"
                }
            }
        }
    }

    #if DEBUG
    /// Debug builds only: UI tests open a chosen page with `-PIStartPage <path relative to the site>`.
    static var launchPage: URL? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-PIStartPage"), index + 1 < arguments.count else { return nil }
        return URL(string: arguments[index + 1], relativeTo: AppConfiguration.publicBase)?.absoluteURL
    }
    #else
    static let launchPage: URL? = nil
    #endif

    func open(_ url: URL) {
        guard let router, let local = router.localURL(for: url) else { return }
        errorMessage = nil
        webView.load(URLRequest(url: local, cachePolicy: .reloadIgnoringLocalCacheData))
    }
    func section(_ page: String) { if let router { open(router.page(page)) } }
    func reload() {
        if errorMessage != nil { server?.stop(); server = nil; ready = false; starting = false; start() }
        else if ready { webView.reload() } else { start() }
    }
    func bookmark() {
        if let local = webView.url, let url = router?.publicURL(for: local) { store.toggleBookmark(url: url, title: title) }
    }
    func share() {
        if let local = webView.url, let url = router?.publicURL(for: local) { sharedItems = SharedItems(items: [url]) }
    }
    func find() { webView.findInteraction?.presentFindNavigator(showingReplace: false) }
    func refreshNavigation() {
        loading = webView.isLoading; canGoBack = webView.canGoBack; canGoForward = webView.canGoForward
    }

    func printPage() {
        guard !loading, ready else { return }
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil); info.jobName = title; info.outputType = .general
        controller.printInfo = info; controller.printFormatter = webView.viewPrintFormatter()
        if UIDevice.current.userInterfaceIdiom == .pad {
            controller.present(from: CGRect(x: webView.bounds.midX, y: 0, width: 1, height: 1), in: webView, animated: true, completionHandler: nil)
        } else { controller.present(animated: true, completionHandler: nil) }
    }

    func checkForUpdate() async {
        guard !checkingUpdate else { return }; checkingUpdate = true
        defer { checkingUpdate = false }
        do {
            var request = URLRequest(url: AppConfiguration.publicBase.appendingPathComponent("publication.json"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (bytes, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200, bytes.count < 65536 else { throw URLError(.badServerResponse) }
            struct Marker: Decodable { let commit: String; let dataset: String }
            let marker = try JSONDecoder().decode(Marker.self, from: bytes)
            guard marker.commit.range(of: "^[a-f0-9]{40}$", options: .regularExpression) != nil else { throw URLError(.cannotParseResponse) }
            updateMessage = marker.commit == version?.commit
                ? "This app contains the current website release."
                : "The website has a different release. Install the latest app update from TestFlight or the App Store when it is available. Your installed collection remains fully available offline."
        } catch { updateMessage = "Could not check online. Your complete installed collection is still available offline." }
    }

    func handleMessage(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let frameURL = message.frameInfo.request.url,
              router?.isLocal(frameURL) == true, let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
        switch kind {
        case "state":
            guard let value = body["url"] as? String, let local = URL(string: value), let publicURL = router?.publicURL(for: local) else { return }
            let text = String((body["title"] as? String ?? "Partial Inventory").prefix(240))
            title = text; currentPublicURL = publicURL; store.visit(url: publicURL, title: text)
        case "print": printPage()
        case "copy":
            guard let text = body["text"] as? String, text.count < 65536 else { return }
            if let url = URL(string: text), let publicURL = router?.publicURL(for: url) { UIPasteboard.general.url = publicURL }
            else { UIPasteboard.general.string = text }
        default: break
        }
    }

    static let bridge = #"""
    (() => {
      const send = body => window.webkit.messageHandlers.inventory.postMessage(body);
      window.print = () => send({kind:'print'});
      try { Object.defineProperty(navigator, 'clipboard', {value:{writeText: async text => send({kind:'copy',text:String(text)})}}); } catch {}
      const state = () => {
        let title = document.title || document.querySelector('h1')?.textContent || 'Partial Inventory';
        if (location.pathname.endsWith('/volume-view.html')) {
          title = (document.querySelector('#volume option:checked')?.textContent || title) + ' · Page ' + (new URL(location.href).searchParams.get('page') || '1');
        }
        send({kind:'state',url:location.href,title:title.trim()});
      };
      for (const method of ['pushState','replaceState']) {
        const original = history[method];
        history[method] = function(...args) { const result = original.apply(this,args); setTimeout(state,400); return result; };
      }
      addEventListener('popstate',()=>setTimeout(state,400));
      addEventListener('hashchange',state);
      addEventListener('load',()=>setTimeout(state,500));
      addEventListener('DOMContentLoaded',()=>{
        const title = document.querySelector('title');
        if (title) new MutationObserver(state).observe(title,{childList:true,subtree:true,characterData:true});
      });
    })();
    """#
}

extension BrowserModel: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if let local = router?.localURL(for: url) {
            if local != url || navigationAction.targetFrame == nil { decisionHandler(.cancel); open(local) }
            else { decisionHandler(.allow) }
        } else {
            decisionHandler(.cancel)
            if ["https", "http"].contains(url.scheme ?? ""), navigationAction.navigationType == .linkActivated || navigationAction.targetFrame == nil {
                externalPage = ExternalPage(url: url)
            }
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshNavigation(); webView.isFindInteractionEnabled = true
        if let local = webView.url, let publicURL = router?.publicURL(for: local) {
            currentPublicURL = publicURL; title = webView.title ?? "Partial Inventory"
            store.visit(url: publicURL, title: title)
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { report(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { report(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
    private func report(_ error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { errorMessage = "This page could not be opened. \(error.localizedDescription)" }
        refreshNavigation()
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        errorMessage = String(message.prefix(1000)); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { completionHandler(false) }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) { completionHandler(nil) }
}

private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var owner: BrowserModel?
    init(_ owner: BrowserModel) { self.owner = owner }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        MainActor.assumeIsolated { owner?.handleMessage(message) }
    }
}
