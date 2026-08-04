import Foundation
import UIKit

struct DeviceRegistrationRequest: Encodable, Sendable {
    let installationId: UUID
    let platform: String
    let environment: String
    let apnsToken: String
    let appVersion: String
    let osVersion: String
    let locale: String
    let timezone: String

    static var installationID: UUID {
        let key = "coursewise.installationID"
        if let value = UserDefaults.standard.string(forKey: key), let id = UUID(uuidString: value) {
            return id
        }
        let id = UUID()
        UserDefaults.standard.set(id.uuidString, forKey: key)
        return id
    }

    @MainActor
    static func current(apnsToken: String) -> Self {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
#if DEBUG
        let environment = "sandbox"
#else
        let environment = "production"
#endif
        return Self(
            installationId: installationID,
            platform: UIDevice.current.userInterfaceIdiom == .pad ? "ipados" : "ios",
            environment: environment,
            apnsToken: apnsToken,
            appVersion: version ?? "1.0.0",
            osVersion: UIDevice.current.systemVersion,
            locale: Locale.current.language.languageCode?.identifier == "zh" ? "zh-CN" : "en",
            timezone: TimeZone.current.identifier
        )
    }
}

struct MobileDeviceSummary: Decodable, Sendable {
    let id: UUID
    let installationId: UUID
    let platform: String
    let environment: String
    let appVersion: String
    let osVersion: String
    let locale: String
    let timezone: String
    let lastSeenAt: String
    let createdAt: String
}

struct NotificationPreferences: Codable, Sendable {
    var announcements: Bool
    var messages: Bool
    var assignments: Bool
    var quizzes: Bool
    var grades: Bool
    var attendance: Bool
    var riskAlerts: Bool
    var sensitivePreviews: Bool
    var quietHoursStart: String?
    var quietHoursEnd: String?
    var timezone: String

    static var defaults: Self {
        Self(
            announcements: true,
            messages: true,
            assignments: true,
            quizzes: true,
            grades: true,
            attendance: true,
            riskAlerts: true,
            sensitivePreviews: false,
            quietHoursStart: nil,
            quietHoursEnd: nil,
            timezone: TimeZone.current.identifier
        )
    }
}

struct AccountDeletionRequestSummary: Decodable, Sendable {
    let id: UUID
    let status: String
    let requestedAt: String
    let resolvedAt: String?
    let resolutionNote: String?
}

struct AccountDeletionRequestResponse: Decodable, Sendable {
    let request: AccountDeletionRequestSummary?
}

struct EmptyRequest: Encodable, Sendable {}
