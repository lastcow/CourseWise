import Foundation

enum UserRole: String, Codable, Sendable {
    case admin
    case teacher
    case student
}

enum UserStatus: String, Codable, Sendable {
    case active
    case inactive
    case suspended
}

struct Account: Codable, Hashable, Identifiable, Sendable {
    let id: UUID
    let email: String
    let name: String
    let role: UserRole
    let status: UserStatus
    let preferredLanguage: String?
}

struct AuthTokens: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let user: Account
}

struct LoginRequest: Encodable, Sendable {
    let email: String
    let password: String
    let rememberMe: Bool
}

struct RefreshRequest: Encodable, Sendable {
    let refreshToken: String
}
