import Foundation
import Security

struct KeychainStore: Sendable {
    private let service = "com.coursewise.app.session"

    func saveRefreshToken(_ token: String, requiresBiometrics: Bool) throws {
        try deleteRefreshToken()
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "refresh-token",
            kSecValueData as String: Data(token.utf8),
        ]
        if requiresBiometrics {
            var error: Unmanaged<CFError>?
            guard let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                [.biometryCurrentSet],
                &error
            ) else {
                throw error?.takeRetainedValue() ?? KeychainError.unavailable
            }
            query[kSecAttrAccessControl as String] = access
        } else {
            query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        }
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }

    func readRefreshToken(context: LAContextProvider? = nil) throws -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "refresh-token",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let rawContext = context?.rawContext {
            query[kSecUseAuthenticationContext as String] = rawContext
        }

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw KeychainError.status(status)
        }
        return String(data: data, encoding: .utf8)
    }

    func deleteRefreshToken() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "refresh-token",
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.status(status)
        }
    }
}

protocol LAContextProvider: Sendable {
    var rawContext: AnyObject { get }
}

enum KeychainError: LocalizedError {
    case unavailable
    case status(OSStatus)

    var errorDescription: String? {
        switch self {
        case .unavailable: "Keychain access is unavailable."
        case let .status(status): SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error \(status)"
        }
    }
}
