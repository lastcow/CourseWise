import SwiftUI

struct ProfileView: View {
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        List {
            if let account = authStore.account {
                Section {
                    LabeledContent("Name", value: account.name)
                    LabeledContent("Email", value: account.email)
                    LabeledContent("Role", value: account.role.rawValue.capitalized)
                }
            }
            Section {
                NavigationLink {
                    PrivacyDataView()
                } label: {
                    Label("nav.privacy", systemImage: "hand.raised")
                }
                NavigationLink {
                    SettingsView()
                } label: {
                    Label("nav.settings", systemImage: "gearshape")
                }
            }
            Section {
                Button(role: .destructive) {
                    Task { await authStore.signOut() }
                } label: {
                    Label("auth.signOut", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
        .navigationTitle("nav.profile")
    }
}
