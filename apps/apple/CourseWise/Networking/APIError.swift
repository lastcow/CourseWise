import Foundation

struct APIErrorPayload: Decodable, Sendable {
    let code: String
    let message: String
    let i18nKey: String?
}
struct APIErrorEnvelope: Decodable, Sendable {
    let error: APIErrorPayload
}

enum APIError: LocalizedError, Sendable {
    case invalidResponse
    case unauthorized
    case server(status: Int, code: String?, message: String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            String(localized: "common.error")
        case .unauthorized:
            String(localized: "auth.genericError")
        case let .server(_, _, message):
            message
        case let .decoding(message):
            message
        }
    }
}

struct Envelope<Value: Decodable & Sendable>: Decodable, Sendable {
    let success: Bool
    let data: Value
}
