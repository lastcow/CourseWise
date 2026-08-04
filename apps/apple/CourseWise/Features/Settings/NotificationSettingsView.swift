import SwiftUI
import UIKit
import UserNotifications

struct NotificationSettingsView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(PushNotificationManager.self) private var pushNotifications
    @Environment(\.openURL) private var openURL
    @State private var preferences = NotificationPreferences.defaults
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            permissionSection

            Section("notifications.categories") {
                Toggle("notifications.announcements", isOn: $preferences.announcements)
                Toggle("notifications.messages", isOn: $preferences.messages)
                Toggle("notifications.assignments", isOn: $preferences.assignments)
                Toggle("notifications.quizzes", isOn: $preferences.quizzes)
                Toggle("notifications.grades", isOn: $preferences.grades)
                Toggle("notifications.attendance", isOn: $preferences.attendance)
                Toggle("notifications.riskAlerts", isOn: $preferences.riskAlerts)
            }
            .disabled(isLoading)

            Section {
                Toggle("notifications.sensitivePreviews", isOn: $preferences.sensitivePreviews)
            } footer: {
                Text("notifications.sensitivePreviewsHelp")
            }
            .disabled(isLoading)

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("settings.notifications")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("common.save") {
                    Task { await save() }
                }
                .disabled(isLoading || isSaving)
            }
        }
        .overlay {
            if isLoading { ProgressView() }
        }
        .task { await load() }
    }

    @ViewBuilder
    private var permissionSection: some View {
        Section {
            switch pushNotifications.authorizationStatus {
            case .notDetermined:
                Button("notifications.enable") {
                    Task { _ = await pushNotifications.requestAuthorization() }
                }
            case .denied:
                Button("notifications.openSettings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
            case .authorized, .provisional, .ephemeral:
                Label("notifications.enabled", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Brand.evergreen)
            @unknown default:
                EmptyView()
            }
        } footer: {
            Text("notifications.permissionHelp")
        }
    }

    private func load() async {
        do {
            let value: NotificationPreferences = try await authStore.authenticatedAPI().get(
                "/api/me/notification-preferences"
            )
            preferences = value
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
        await pushNotifications.refreshRegistration()
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        preferences.timezone = TimeZone.current.identifier
        do {
            let saved: NotificationPreferences = try await authStore.authenticatedAPI().patch(
                "/api/me/notification-preferences",
                body: preferences
            )
            preferences = saved
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }
}
