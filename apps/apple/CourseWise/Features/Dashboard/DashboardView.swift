import SwiftUI

struct DashboardView: View {
    @Environment(AuthStore.self) private var authStore

    private var account: Account? { authStore.account }
    private var role: UserRole { account?.role ?? .student }

    private var subtitleKey: LocalizedStringKey {
        switch role {
        case .student: "dashboard.subtitle.student"
        case .teacher: "dashboard.subtitle.teacher"
        case .admin: "dashboard.subtitle.admin"
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(String(format: String(localized: "dashboard.greeting"), account?.name ?? "CourseWise"))
                        .font(.largeTitle.bold())
                    Text(subtitleKey)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 16)], spacing: 16) {
                    ForEach(FeatureDestination.dashboardItems(for: role)) { destination in
                        NavigationLink(value: destination) {
                            FeatureCard(destination: destination)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding()
            .frame(maxWidth: 1000, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Brand.paper)
        .navigationTitle("dashboard.title")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: FeatureDestination.profile) {
                    Image(systemName: "person.crop.circle")
                }
                .accessibilityLabel(Text("nav.profile"))
            }
        }
    }
}
private struct FeatureCard: View {
    let destination: FeatureDestination

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: destination.systemImage)
                .font(.title2)
                .foregroundStyle(Brand.evergreen)
                .symbolRenderingMode(.hierarchical)
            Text(destination.titleKey)
                .font(.headline)
                .foregroundStyle(Brand.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(18)
        .frame(minHeight: 116)
        .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Brand.ink.opacity(0.08))
        }
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
