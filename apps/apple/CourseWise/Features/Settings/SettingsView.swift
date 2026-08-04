import SwiftUI

struct SettingsView: View {
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        List {
            Section {
                Toggle(
                    "settings.faceID",
                    isOn: Binding(
                        get: { authStore.biometricUnlockEnabled },
                        set: { enabled in
                            Task { await authStore.setBiometricUnlockEnabled(enabled) }
                        }
                    )
                )
            } footer: {
                Text("settings.faceIDHelp")
            }

            Section {
                NavigationLink {
                    NotificationSettingsView()
                } label: {
                    Label("settings.notifications", systemImage: "bell.badge")
                }
            }

            Section("settings.language") {
                LabeledContent("English / 简体中文", value: Locale.current.language.languageCode?.identifier ?? "en")
            }

            Section("settings.support") {
                Link(destination: URL(string: "mailto:ebiz@chen.me")!) {
                    Label("settings.supportEmail", systemImage: "envelope")
                }
            }
        }
        .navigationTitle("nav.settings")
    }
}
