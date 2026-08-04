import Observation
import UIKit
import UserNotifications

@MainActor
@Observable
final class PushNotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PushNotificationManager()

    var authorizationStatus: UNAuthorizationStatus = .notDetermined
    var deviceToken: String?
    var errorMessage: String?

    private override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func refreshRegistration() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    @discardableResult
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .badge, .sound]
            )
            await refreshRegistration()
            return granted
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func receive(deviceToken data: Data) {
        deviceToken = data.map { String(format: "%02x", $0) }.joined()
        errorMessage = nil
    }

    func receiveRegistration(error: Error) {
        errorMessage = error.localizedDescription
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushNotificationManager.shared.receive(deviceToken: deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            PushNotificationManager.shared.receiveRegistration(error: error)
        }
    }
}
