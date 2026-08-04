import SwiftUI

@main
struct CourseWiseApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var authStore = AuthStore(configuration: .current)
    @State private var pushNotifications = PushNotificationManager.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authStore)
                .environment(pushNotifications)
                .tint(Brand.evergreen)
                .task { await authStore.restoreSession() }
                .onOpenURL { url in
                    authStore.pendingDeepLink = DeepLink(url: url)
                }
                .privacySensitive()
        }
        .onChange(of: scenePhase) { _, phase in
            authStore.handleScenePhase(phase)
        }
    }
}
