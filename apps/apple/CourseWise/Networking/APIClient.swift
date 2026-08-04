import Foundation

actor APIClient {
    private let configuration: AppConfiguration
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var accessToken: String?

    init(configuration: AppConfiguration, session: URLSession = .shared) {
        self.configuration = configuration
        self.session = session
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
    }

    func setAccessToken(_ token: String?) {
        accessToken = token
    }

    func get<Value: Decodable & Sendable>(_ path: String) async throws -> Value {
        try await request(path: path, method: "GET", body: Optional<String>.none)
    }

    func post<Body: Encodable & Sendable, Value: Decodable & Sendable>(
        _ path: String,
        body: Body
    ) async throws -> Value {
        try await request(path: path, method: "POST", body: body)
    }

    func patch<Body: Encodable & Sendable, Value: Decodable & Sendable>(
        _ path: String,
        body: Body
    ) async throws -> Value {
        try await request(path: path, method: "PATCH", body: body)
    }

    func delete<Value: Decodable & Sendable>(_ path: String) async throws -> Value {
        try await request(path: path, method: "DELETE", body: Optional<String>.none)
    }

    private func request<Body: Encodable & Sendable, Value: Decodable & Sendable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Value {
        guard let url = URL(string: path, relativeTo: configuration.apiBaseURL) else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("CourseWise-iOS/1", forHTTPHeaderField: "X-CourseWise-Client")
        request.setValue(Locale.current.identifier, forHTTPHeaderField: "Accept-Language")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard 200 ..< 300 ~= http.statusCode else {
            let payload = try? decoder.decode(APIErrorEnvelope.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                code: payload?.error.code,
                message: payload?.error.message ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            )
        }

        do {
            return try decoder.decode(Envelope<Value>.self, from: data).data
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }
}
