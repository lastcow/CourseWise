import SwiftUI

struct DashboardView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var courses: [CourseSummary] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private var account: Account? { authStore.account }
    private var role: UserRole { account?.role ?? .student }

    private var subtitleKey: LocalizedStringKey {
        switch role {
        case .student: "dashboard.subtitle.student"
        case .teacher: "dashboard.subtitle.teacher"
        case .admin: "dashboard.subtitle.admin"
        }
    }

    private var roleKey: LocalizedStringKey {
        switch role {
        case .student: "role.student"
        case .teacher: "role.teacher"
        case .admin: "role.admin"
        }
    }

    private var cardColumns: [GridItem] {
        [GridItem(.adaptive(minimum: horizontalSizeClass == .regular ? 260 : 280), spacing: 16)]
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                DashboardHero(
                    name: account?.name ?? "CourseWise",
                    subtitleKey: subtitleKey,
                    roleKey: roleKey,
                    courseCount: courses.count,
                    accountStatus: account?.status ?? .active,
                    isLoading: isLoading
                )

                if errorMessage != nil {
                    DashboardRefreshNotice(retry: reload)
                }

                DashboardSectionHeader(
                    titleKey: "dashboard.section.workspace",
                    subtitleKey: "dashboard.section.workspaceHelp"
                )

                LazyVGrid(columns: cardColumns, spacing: 16) {
                    ForEach(FeatureDestination.dashboardItems(for: role)) { destination in
                        NavigationLink {
                            DashboardComponentDetailView(
                                destination: destination,
                                courses: courses,
                                role: role
                            )
                        } label: {
                            DashboardFeatureCard(
                                destination: destination,
                                courseCount: courses.count
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }

                if !courses.isEmpty {
                    RecentCoursesSection(courses: Array(courses.prefix(3)))
                }
            }
            .padding(horizontalSizeClass == .regular ? 28 : 16)
            .padding(.bottom, 24)
            .frame(maxWidth: 1100, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
        .background(DashboardBackground())
        .navigationTitle("dashboard.title")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: FeatureDestination.profile) {
                    Image(systemName: "person.crop.circle")
                }
                .accessibilityLabel(Text("nav.profile"))
            }
        }
        .task { await load() }
    }

    private func reload() { Task { await load() } }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            courses = try await authStore.authenticatedAPI().get("/api/courses")
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct DashboardBackground: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Brand.paper
            RadialGradient(
                colors: [Brand.evergreen.opacity(0.10), .clear],
                center: .topTrailing,
                startRadius: 20,
                endRadius: 430
            )
            .ignoresSafeArea()
        }
        .ignoresSafeArea()
    }
}

private struct DashboardHero: View {
    let name: String
    let subtitleKey: LocalizedStringKey
    let roleKey: LocalizedStringKey
    let courseCount: Int
    let accountStatus: UserStatus
    let isLoading: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(alignment: .top) {
                Label(roleKey, systemImage: "checkmark.seal.fill")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 11)
                    .padding(.vertical, 7)
                    .background(.white.opacity(0.14), in: Capsule())

                Spacer()

                Text(Date.now, format: .dateTime.month(.abbreviated).day().weekday(.abbreviated))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.white.opacity(0.78))
            }

            VStack(alignment: .leading, spacing: 7) {
                Text(String(format: String(localized: "dashboard.greeting"), name))
                    .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    .lineLimit(2)
                Text(subtitleKey)
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.82))
            }

            HStack(spacing: 0) {
                HeroMetric(
                    value: isLoading ? "—" : "\(courseCount)",
                    labelKey: "dashboard.visibleCourses"
                )
                Divider().overlay(.white.opacity(0.18)).padding(.horizontal, 18)
                HeroMetric(
                    valueKey: accountStatus == .active ? "status.active" : "status.limited",
                    labelKey: "dashboard.accountStatus"
                )
            }
            .frame(maxWidth: 430, alignment: .leading)
        }
        .foregroundStyle(.white)
        .padding(24)
        .background {
            ZStack(alignment: .bottomTrailing) {
                LinearGradient(
                    colors: [Brand.evergreen, Color(red: 0.08, green: 0.22, blue: 0.20)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                Circle()
                    .fill(.white.opacity(0.07))
                    .frame(width: 230, height: 230)
                    .offset(x: 65, y: 105)
                Circle()
                    .stroke(.white.opacity(0.09), lineWidth: 22)
                    .frame(width: 130, height: 130)
                    .offset(x: 20, y: 48)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: Brand.evergreen.opacity(0.16), radius: 22, y: 12)
        .accessibilityElement(children: .combine)
    }
}

private struct HeroMetric: View {
    private let value: String?
    private let valueKey: LocalizedStringKey?
    let labelKey: LocalizedStringKey

    init(value: String, labelKey: LocalizedStringKey) {
        self.value = value
        valueKey = nil
        self.labelKey = labelKey
    }

    init(valueKey: LocalizedStringKey, labelKey: LocalizedStringKey) {
        value = nil
        self.valueKey = valueKey
        self.labelKey = labelKey
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            if let value {
                Text(value)
            } else if let valueKey {
                Text(valueKey)
            }
            Text(labelKey)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.68))
        }
        .font(.headline)
    }
}

private struct DashboardSectionHeader: View {
    let titleKey: LocalizedStringKey
    let subtitleKey: LocalizedStringKey

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(titleKey).font(.title2.bold())
            Text(subtitleKey)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

private struct DashboardFeatureCard: View {
    let destination: FeatureDestination
    let courseCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                Image(systemName: destination.systemImage)
                    .font(.title2)
                    .foregroundStyle(Brand.evergreen)
                    .symbolRenderingMode(.hierarchical)
                    .frame(width: 46, height: 46)
                    .background(Brand.evergreen.opacity(0.11), in: RoundedRectangle(cornerRadius: 14))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(destination.titleKey)
                    .font(.headline)
                    .foregroundStyle(Brand.ink)
                Text(destination.dashboardDescriptionKey)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            Spacer(minLength: 0)

            HStack(spacing: 7) {
                Circle()
                    .fill(Brand.evergreen)
                    .frame(width: 6, height: 6)
                if destination.isCourseScoped {
                    Text(String(format: String(localized: "dashboard.courseScope"), courseCount))
                } else {
                    Text("dashboard.accountScope")
                }
            }
            .font(.caption.weight(.medium))
            .foregroundStyle(Brand.evergreen)
        }
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 206, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text("dashboard.viewDetails"))
    }
}

private struct DashboardRefreshNotice: View {
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text("dashboard.dataUnavailable").font(.subheadline.bold())
                Text("dashboard.dataUnavailableHelp")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("common.retry", action: retry)
                .buttonStyle(.bordered)
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private struct RecentCoursesSection: View {
    let courses: [CourseSummary]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            DashboardSectionHeader(
                titleKey: "dashboard.section.recentCourses",
                subtitleKey: "dashboard.section.recentCoursesHelp"
            )
            VStack(spacing: 0) {
                ForEach(Array(courses.enumerated()), id: \.element.id) { index, course in
                    NavigationLink(value: FeatureDestination.courses) {
                        HStack(spacing: 13) {
                            Text(course.code.prefix(2).uppercased())
                                .font(.caption.bold())
                                .foregroundStyle(Brand.evergreen)
                                .frame(width: 42, height: 42)
                                .background(Brand.evergreen.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(course.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Brand.ink)
                                    .lineLimit(1)
                                HStack(spacing: 5) {
                                    Text(course.code)
                                    if let term = course.term { Text("• \(term)") }
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.bold())
                                .foregroundStyle(.tertiary)
                        }
                        .padding(14)
                    }
                    .buttonStyle(.plain)
                    if index < courses.count - 1 { Divider().padding(.leading, 69) }
                }
            }
            .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Brand.ink.opacity(0.07))
            }
        }
    }
}
