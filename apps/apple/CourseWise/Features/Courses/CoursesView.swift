import SwiftUI

struct CoursesView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var courses: [CourseSummary] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var searchText = ""
    @State private var statusFilter = CourseStatusFilter.all

    private var filteredCourses: [CourseSummary] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return courses
            .filter { course in
                let matchesStatus = statusFilter == .all || course.status == statusFilter.rawValue
                guard matchesStatus else { return false }
                guard !query.isEmpty else { return true }
                return course.title.lowercased().contains(query)
                    || course.code.lowercased().contains(query)
                    || course.term?.lowercased().contains(query) == true
                    || course.description?.lowercased().contains(query) == true
            }
            .sorted { lhs, rhs in
                let lhsRank = CourseStatusFilter.sortRank(for: lhs.status)
                let rhsRank = CourseStatusFilter.sortRank(for: rhs.status)
                return lhsRank == rhsRank
                    ? lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
                    : lhsRank < rhsRank
            }
    }

    private var gridColumns: [GridItem] {
        [
            GridItem(
                .adaptive(minimum: horizontalSizeClass == .regular ? 310 : 280, maximum: 430),
                spacing: 18,
                alignment: .top
            ),
        ]
    }

    var body: some View {
        Group {
            if isLoading && courses.isEmpty {
                ProgressView("common.loading")
            } else if let errorMessage, courses.isEmpty {
                ContentUnavailableView {
                    Label("common.error", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("common.retry", action: reload)
                }
            } else if courses.isEmpty {
                ContentUnavailableView {
                    Label("courses.empty.title", systemImage: "books.vertical")
                } description: {
                    Text("courses.empty.description")
                }
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        CoursesOverview(courses: courses)

                        if filteredCourses.isEmpty {
                            ContentUnavailableView {
                                Label("courses.noResults.title", systemImage: "magnifyingglass")
                            } description: {
                                Text("courses.noResults.description")
                            }
                            .frame(maxWidth: .infinity, minHeight: 280)
                        } else {
                            LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 18) {
                                ForEach(filteredCourses) { course in
                                    NavigationLink {
                                        CourseHubView(course: course)
                                    } label: {
                                        CourseCatalogCard(course: course)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("courses.row.\(course.id.uuidString)")
                                }
                            }
                        }
                    }
                    .padding(.horizontal, horizontalSizeClass == .regular ? 28 : 16)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                    .frame(maxWidth: 1100, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("courses.list")
                .refreshable { await load() }
                .background(Brand.paper)
            }
        }
        .navigationTitle("nav.courses")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $searchText, prompt: Text("courses.search"))
        .toolbar {
            if !courses.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("courses.filter.title", selection: $statusFilter) {
                            ForEach(CourseStatusFilter.allCases) { filter in
                                Label(filter.titleKey, systemImage: filter.systemImage)
                                    .tag(filter)
                            }
                        }
                    } label: {
                        Image(
                            systemName: statusFilter == .all
                                ? "line.3.horizontal.decrease.circle"
                                : "line.3.horizontal.decrease.circle.fill"
                        )
                    }
                    .accessibilityLabel(Text("courses.filter.title"))
                    .accessibilityIdentifier("courses.filter")
                }
            }
        }
        .task { await load() }
    }

    private func reload() { Task { await load() } }

    private func load() async {
#if DEBUG
        if let fixture = UITestFixture.current {
            courses = fixture.courses
            errorMessage = nil
            return
        }
#endif
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

private enum CourseStatusFilter: String, CaseIterable, Identifiable {
    case all
    case active
    case draft
    case archived

    var id: String { rawValue }

    var titleKey: LocalizedStringKey {
        switch self {
        case .all: "courses.filter.all"
        case .active: "courses.status.active"
        case .draft: "courses.status.draft"
        case .archived: "courses.status.archived"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "square.grid.2x2"
        case .active: "checkmark.circle"
        case .draft: "pencil.circle"
        case .archived: "archivebox"
        }
    }

    static func sortRank(for status: String) -> Int {
        switch status {
        case "active": 0
        case "draft": 1
        case "archived": 2
        default: 3
        }
    }
}

private struct CoursesOverview: View {
    let courses: [CourseSummary]

    private var activeCount: Int { courses.count(where: { $0.status == "active" }) }
    private var archivedCount: Int { courses.count(where: { $0.status == "archived" }) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Brand.evergreen.opacity(0.12))
                    Image(systemName: "books.vertical.fill")
                        .font(.title3)
                        .foregroundStyle(Brand.evergreen)
                }
                .frame(width: 50, height: 50)

                VStack(alignment: .leading, spacing: 4) {
                    Text("courses.overview.title")
                        .font(.headline)
                    Text("courses.overview.subtitle")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Divider()

            HStack(spacing: 0) {
                CourseOverviewMetric(value: courses.count, labelKey: "courses.metric.available")
                Divider().padding(.horizontal, 14)
                CourseOverviewMetric(value: activeCount, labelKey: "courses.status.active")
                Divider().padding(.horizontal, 14)
                CourseOverviewMetric(value: archivedCount, labelKey: "courses.status.archived")
            }
        }
        .padding(18)
        .background(.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .accessibilityIdentifier("courses.summary")
    }
}

private struct CourseOverviewMetric: View {
    let value: Int
    let labelKey: LocalizedStringKey

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value, format: .number)
                .font(.title3.bold())
                .monospacedDigit()
            Text(labelKey)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct CourseCatalogCard: View {
    let course: CourseSummary

    private var statusKey: LocalizedStringKey {
        switch course.status {
        case "active": "courses.status.active"
        case "draft": "courses.status.draft"
        case "archived": "courses.status.archived"
        default: "courses.status.unknown"
        }
    }

    private var statusColor: Color {
        switch course.status {
        case "active": Brand.evergreen
        case "draft": .orange
        default: .secondary
        }
    }

    private var scheduleText: String? {
        let start = formattedDate(course.startDate)
        let end = formattedDate(course.endDate)
        return switch (start, end) {
        case let (start?, end?): "\(start) – \(end)"
        case let (start?, nil): start
        case let (nil, end?): end
        default: nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                CourseBanner(course: course)
                LinearGradient(
                    colors: [.black.opacity(0.08), .black.opacity(0.52)],
                    startPoint: .top,
                    endPoint: .bottom
                )

                VStack(alignment: .leading) {
                    HStack(spacing: 7) {
                        CourseStatusBadge(titleKey: statusKey, color: statusColor)
                        if course.lmsProvider == "canvas" {
                            CourseStatusBadge(titleKey: "courses.canvas", color: .blue)
                        }
                        Spacer()
                        Text(course.code)
                            .font(.caption.bold().monospaced())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 6)
                            .background(.black.opacity(0.34), in: Capsule())
                    }
                    Spacer()
                    Text(course.title)
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                .padding(14)
            }
            .frame(height: 146)
            .clipped()

            VStack(alignment: .leading, spacing: 11) {
                HStack(spacing: 7) {
                    if let term = course.term {
                        Label(term, systemImage: "calendar")
                    }
                    if let scheduleText {
                        Label(scheduleText, systemImage: "calendar.badge.clock")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

                if let description = course.description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .frame(minHeight: 38, alignment: .topLeading)
                } else {
                    Text("courses.description.unavailable")
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                        .frame(minHeight: 38, alignment: .topLeading)
                }

                Divider()

                HStack(spacing: 0) {
                    CourseCardMetric(
                        icon: "square.grid.2x2",
                        value: course.counts.modules,
                        labelKey: "courses.metric.modules",
                        identifier: "courses.metric.\(course.id.uuidString).modules"
                    )
                    CourseCardMetric(
                        icon: "checklist",
                        value: course.counts.assignments,
                        labelKey: "courses.metric.assignments",
                        identifier: "courses.metric.\(course.id.uuidString).assignments"
                    )
                    CourseCardMetric(
                        icon: "rectangle.on.rectangle.angled",
                        value: course.counts.presentations,
                        labelKey: "courses.metric.presentations",
                        identifier: "courses.metric.\(course.id.uuidString).presentations"
                    )
                    CourseCardMetric(
                        icon: "person.2",
                        value: course.counts.students,
                        labelKey: "courses.metric.students",
                        identifier: "courses.metric.\(course.id.uuidString).students"
                    )
                }
            }
            .padding(15)
        }
        .background(.background, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Brand.ink.opacity(0.08))
        }
        .shadow(color: Brand.ink.opacity(0.07), radius: 14, y: 7)
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func formattedDate(_ value: String?) -> String? {
        guard let value else { return nil }
        let date = (try? Date(value, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
            ?? (try? Date(value, strategy: .iso8601))
        return date?.formatted(date: .abbreviated, time: .omitted)
    }
}

private struct CourseStatusBadge: View {
    let titleKey: LocalizedStringKey
    let color: Color

    var body: some View {
        Label(titleKey, systemImage: "circle.fill")
            .font(.caption2.bold())
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(.ultraThinMaterial, in: Capsule())
    }
}

private struct CourseBanner: View {
    let course: CourseSummary

    var body: some View {
        if let value = course.bannerURLString, let url = URL(string: value) {
            AsyncImage(url: url, transaction: Transaction(animation: .easeInOut)) { phase in
                switch phase {
                case let .success(image):
                    image.resizable().scaledToFill()
                case .empty:
                    ZStack {
                        CourseBannerFallback(code: course.code)
                        ProgressView().tint(.white)
                    }
                default:
                    CourseBannerFallback(code: course.code)
                }
            }
        } else {
            CourseBannerFallback(code: course.code)
        }
    }
}

private struct CourseBannerFallback: View {
    let code: String

    private var palette: [Color] {
        let palettes: [[Color]] = [
            [Brand.evergreen, Color(red: 0.08, green: 0.22, blue: 0.20)],
            [Color(red: 0.20, green: 0.31, blue: 0.48), Color(red: 0.11, green: 0.17, blue: 0.29)],
            [Color(red: 0.48, green: 0.29, blue: 0.22), Color(red: 0.27, green: 0.16, blue: 0.13)],
            [Color(red: 0.34, green: 0.24, blue: 0.48), Color(red: 0.18, green: 0.12, blue: 0.27)],
        ]
        let index = code.unicodeScalars.reduce(0) { $0 + Int($1.value) } % palettes.count
        return palettes[index]
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            LinearGradient(colors: palette, startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle()
                .fill(.white.opacity(0.08))
                .frame(width: 180, height: 180)
                .offset(x: 45, y: 75)
            Circle()
                .stroke(.white.opacity(0.10), lineWidth: 18)
                .frame(width: 105, height: 105)
                .offset(x: 8, y: 34)
        }
    }
}

private struct CourseCardMetric: View {
    let icon: String
    let value: Int
    let labelKey: LocalizedStringKey
    let identifier: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(Brand.evergreen)
            Text(value, format: .number)
                .font(.caption.bold())
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(labelKey))
        .accessibilityValue(Text(value, format: .number))
        .accessibilityIdentifier(identifier)
    }
}

private struct CourseHubView: View {
    let course: CourseSummary

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(course.title).font(.title2.bold())
                    Text(course.code).foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }
            Section {
                ForEach([
                    FeatureDestination.modules,
                    .materials,
                    .assignments,
                    .quizzes,
                    .announcements,
                    .discussions,
                    .attendance,
                    .grades,
                    .messages,
                ]) { destination in
                    NavigationLink {
                        CourseDestinationView(destination: destination, course: course)
                    } label: {
                        Label(destination.titleKey, systemImage: destination.systemImage)
                    }
                    .accessibilityIdentifier("course.feature.\(destination.rawValue)")
                }
            }
        }
        .navigationTitle(course.code)
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("course.hub")
    }
}
