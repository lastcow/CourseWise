import SwiftUI

struct PrivacyDataView: View {
    private let web = AppConfiguration.current.webBaseURL

    var body: some View {
        List {
            Section {
                Link(destination: web.appending(path: "legal/privacy")) {
                    Label("settings.privacy", systemImage: "hand.raised")
                }
                Link(destination: web.appending(path: "legal/data-requests")) {
                    Label("settings.export", systemImage: "square.and.arrow.down")
                }
                NavigationLink {
                    ResourceListView(destination: .privacy)
                } label: {
                    Label("settings.disclosures", systemImage: "list.bullet.clipboard")
                }
                Link(destination: web.appending(path: "legal/data-requests")) {
                    Label("settings.corrections", systemImage: "pencil.and.list.clipboard")
                }
                NavigationLink {
                    AccountDeletionView()
                } label: {
                    Label("settings.delete", systemImage: "person.crop.circle.badge.minus")
                }
            }
        }
        .navigationTitle("nav.privacy")
    }
}
