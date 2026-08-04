import SwiftUI

struct AppShellView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(PushNotificationManager.self) private var pushNotifications
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var sidebarSelection: FeatureDestination?
    @State private var iPhonePath: [FeatureDestination] = []

    var body: some View {
        Group {
            if horizontalSizeClass == .regular {
                iPadShell
            } else {
                iPhoneShell
            }
        }
        .task {
            await pushNotifications.refreshRegistration()
        }
        .task(id: pushNotifications.deviceToken) {
            guard let token = pushNotifications.deviceToken else { return }
            await authStore.registerForPushNotifications(deviceToken: token)
        }
        .onChange(of: authStore.pendingDeepLink) { _, deepLink in
            guard case let .course(_, feature) = deepLink?.destination else { return }
            let destination = feature ?? .courses
            if horizontalSizeClass == .regular {
                sidebarSelection = destination
            } else {
                iPhonePath = [destination]
            }
            authStore.pendingDeepLink = nil
        }
    }

    private var iPhoneShell: some View {
        NavigationStack(path: $iPhonePath) {
            DashboardView()
                .navigationDestination(for: FeatureDestination.self) { destination in
                    destinationView(destination)
                }
        }
    }

    private var iPadShell: some View {
        NavigationSplitView {
            List(selection: $sidebarSelection) {
                Section {
                    BrandHeader(compact: true)
                        .listRowBackground(Color.clear)
                }
                Section {
                    Button {
                        sidebarSelection = nil
                    } label: {
                        Label("dashboard.title", systemImage: "rectangle.3.group")
                    }
                    ForEach(FeatureDestination.sidebarItems(for: role)) { item in
                        NavigationLink(value: item) {
                            Label(item.titleKey, systemImage: item.systemImage)
                        }
                    }
                }
            }
            .navigationTitle("app.name")
        } detail: {
            NavigationStack {
                if let sidebarSelection {
                    destinationView(sidebarSelection)
                } else {
                    DashboardView()
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    private var role: UserRole { authStore.account?.role ?? .student }

    @ViewBuilder
    private func destinationView(_ destination: FeatureDestination) -> some View {
        switch destination {
        case .courses:
            CoursesView()
        case .assignments, .review, .quizzes, .materials, .modules, .announcements, .messages,
             .attendance, .grades, .discussions, .students, .groups:
            CourseFeaturePickerView(destination: destination)
        case .alerts:
            ResourceListView(destination: destination)
        case .settings:
            SettingsView()
        case .profile:
            ProfileView()
        case .privacy:
            PrivacyDataView()
        }
    }
}
