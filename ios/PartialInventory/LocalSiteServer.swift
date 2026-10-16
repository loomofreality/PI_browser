import Foundation
import Network

/// Loopback HTTP preserves Web Workers, ES modules, fetch, gzip decoding and PDF range requests.
/// Only read-only files in Website are reachable. No LAN binding and no directory listing.
final class LocalSiteServer {
    private let root: URL
    private let queue = DispatchQueue(label: "org.partialinventory.local-http", qos: .userInitiated)
    private var listener: NWListener?
    private var clients: [UUID: HTTPConnection] = [:]

    init(root: URL) { self.root = root }
    func start(preferredPort: UInt16?, completion: @escaping (Result<URL, Error>) -> Void) {
        queue.async { self.listen(port: preferredPort, canRetry: preferredPort != nil, completion: completion) }
    }
    func stop() {
        queue.async { self.listener?.cancel(); for client in Array(self.clients.values) { client.close() } }
    }
    private func listen(port: UInt16?, canRetry: Bool, completion: @escaping (Result<URL, Error>) -> Void) {
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: port.flatMap { NWEndpoint.Port(rawValue: $0) } ?? .any)
            let server = try NWListener(using: parameters)
            listener = server
            var completed = false
            server.stateUpdateHandler = { [weak self, weak server] state in
                guard let self, let server else { return }
                switch state {
                case .ready:
                    guard !completed, let port = server.port else { return }
                    completed = true
                    completion(.success(URL(string: "http://127.0.0.1:\(port.rawValue)\(AppConfiguration.sitePath)")!))
                case .failed(let error):
                    server.cancel()
                    guard !completed else { return }
                    completed = true
                    if canRetry { self.listen(port: nil, canRetry: false, completion: completion) }
                    else { completion(.failure(error)) }
                default: break
                }
            }
            server.newConnectionHandler = { [weak self, weak server] connection in
                guard let self, let port = server?.port, self.clients.count < 48 else { connection.cancel(); return }
                let id = UUID()
                let client = HTTPConnection(connection: connection, root: self.root, port: port.rawValue, queue: self.queue) { [weak self] in self?.clients.removeValue(forKey: id) }
                self.clients[id] = client
                client.start()
            }
            server.start(queue: queue)
        } catch { completion(.failure(error)) }
    }
    deinit { listener?.cancel() }
}

private final class HTTPConnection {
    let connection: NWConnection
    let root: URL
    let port: UInt16
    let queue: DispatchQueue
    let finished: () -> Void
    var buffer = Data()
    var handle: FileHandle?
    var remaining: UInt64 = 0
    var closed = false

    init(connection: NWConnection, root: URL, port: UInt16, queue: DispatchQueue, finished: @escaping () -> Void) {
        self.connection = connection; self.root = root; self.port = port; self.queue = queue; self.finished = finished
    }
    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            if case .failed = state { self?.close() }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 30) { [weak self] in self?.close() }
        receive()
    }
    func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] bytes, _, complete, error in
            guard let self, !self.closed else { return }
            if let bytes { self.buffer.append(bytes) }
            if self.buffer.count > 16384 { self.send(.failure(431)); return }
            if let end = self.buffer.range(of: Data("\r\n\r\n".utf8)) {
                guard let request = String(data: self.buffer[..<end.upperBound], encoding: .utf8) else { self.send(.failure(400)); return }
                self.send(HTTPFileResponse.make(request: request, root: self.root, port: self.port))
            } else if complete || error != nil { self.close() }
            else { self.receive() }
        }
    }
    func send(_ response: HTTPFileResponse) {
        var response = response
        if response.sendBody, response.length > 0, let file = response.file {
            do { handle = try FileHandle(forReadingFrom: file); try handle?.seek(toOffset: response.offset); remaining = response.length }
            catch { response = .failure(500) }
        }
        connection.send(content: response.headerData, completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            if error != nil { self.close() } else { self.sendChunk() }
        })
    }
    func sendChunk() {
        guard !closed else { return }
        guard remaining > 0, let handle else { close(); return }
        do {
            guard let bytes = try handle.read(upToCount: Int(min(remaining, 65536))), !bytes.isEmpty else { close(); return }
            remaining -= UInt64(bytes.count)
            connection.send(content: bytes, completion: .contentProcessed { [weak self] error in
                if error != nil { self?.close() } else { self?.sendChunk() }
            })
        } catch { close() }
    }
    func close() {
        guard !closed else { return }; closed = true
        try? handle?.close(); handle = nil; connection.cancel(); finished()
    }
}
