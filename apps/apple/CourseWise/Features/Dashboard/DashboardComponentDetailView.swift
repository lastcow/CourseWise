import SwiftUI

struct DashboardComponentDetailView: View {
    let destination: FeatureDestination
    let courses: [CourseSummary]
    let role: UserRole

    private var roleKey: LocalizedStringKey {
        switch role {
        case .student: "role.student"
        case .teacher: "role.teacher"
        case .admin: "role.admin"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                componentHero

                DashboardDetailSection(titleKey: "dashboard.detail.overview") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 145), spacing: 12)], spacing: 12) {
                        DetailMetric(
                            value: destination.isCourseScoped ? "\(courses.count)" : String(localized: "dashboard.detail.accountLevel"),
                            labelKey: destination.isCourseScoped ? "dashboard.visibleCourses" : "dashboard.detail.scope"
                        )
                        DetailMetric(valueKey: roleKey, labelKey: "dashboard.role")
                        DetailMetric(valueKey: "dashboard.detail.ready", labelKey: "dashboard.detail.availability")
                    }
                }

                DashboardDetailSection(titleKey: "dashboard.detail.capabilities") {
                    VStack(spacing: 0) {
                        ForEach(Array(destination.dashboardCapabilityKeys.enumerated()), id: \.offset) { index, capability in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(Brand.evergreen)
                                Text(capability)
                                    .font(.subheadline)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.vertical, 14)
                            if index < destination.dashboardCapabilityKeys.count - 1 { Divider() }
                        }
                    }
                    .padding(.horizontal, 16)
                    .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }

                if destination.isCourseScoped {
                    DashboardDetailSection(titleKey: "dashboard.detail.courseAccess") {
                        VStack(alignment: .leading, spacing: 14) {
                            Text(courses.isEmpty ? "dashboard.detail.noCourses" : "dashboard.detail.courseAccessHelp")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            ForEach(courses.prefix(3)) { course in
                                HStack(spacing: 12) {
                                    Image(systemName: "book.closed.fill")
                                        .foregroundStyle(Brand.evergreen)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(course.title).font(.subheadline.weight(.semibold))
                                        Text(course.code)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if let term = course.term {
                                        Text(term)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }
                }

                NavigationLink(value: destination) {
                    Label("dashboard.detail.open", systemImage: "arrow.up.right")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                }
                .buttonStyle(.borderedProminent)
                .tint(Brand.evergreen)
                .controlSize(.large)
            }
            .padding()
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Brand.paper)
        .navigationTitle(destination.titleKey)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Brand.paper, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }

    private var componentHero: some View {
        HStack(alignment: .top, spacing: 18) {
            Image(systemName: destination.systemImage)
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 62, height: 62)
                .background(.white.opacity(0.16), in: RoundedRectangle(cornerRadius: 19))
            VStack(alignment: .leading, spacing: 7) {
                Text(destination.titleKey)
                    .font(.title2.bold())
                Text(destination.dashboardDescriptionKey)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.80))
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(.white)
        .padding(22)
        .background(
            LinearGradient(
                colors: [Brand.evergreen, Color(red: 0.08, green: 0.22, blue: 0.20)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 26, style: .continuous)
        )
    }
}

private struct DashboardDetailSection<Content: View>: View {
    let titleKey: LocalizedStringKey
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(titleKey).font(.headline)
            content
        }
    }
}

private struct DetailMetric: View {
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
        VStack(alignment: .leading, spacing: 5) {
            if let value {
                Text(value)
            } else if let valueKey {
                Text(valueKey)
            }
            Text(labelKey)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .font(.headline)
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
        .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
