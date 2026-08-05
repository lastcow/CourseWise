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

    private var statusSymbol: String {
        switch course.status {
        case "active": "checkmark"
        case "draft": "pencil"
        case "archived": "archivebox.fill"
        default: "questionmark"
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
            ZStack {
                CourseBanner(course: course)
                LinearGradient(
                    colors: [.black.opacity(0.22), .clear, .black.opacity(0.10)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .frame(height: 136)
            .overlay(alignment: .top) {
                HStack(alignment: .center, spacing: 8) {
                    Text(course.code)
                        .font(.caption2.bold().monospaced())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .frame(height: 30)
                        .background(.black.opacity(0.34), in: Capsule())

                    Spacer()

                    HStack(spacing: 8) {
                        CourseHeroIndicator(
                            systemImage: statusSymbol,
                            titleKey: statusKey,
                            color: statusColor,
                            identifier: "courses.card.\(course.id.uuidString).status"
                        )
                        if course.lmsProvider == "canvas" {
                            CourseHeroIndicator(
                                systemImage: "circle.grid.3x3.fill",
                                titleKey: "courses.canvas",
                                color: .blue,
                                identifier: "courses.card.\(course.id.uuidString).canvas"
                            )
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
            }
            .clipped()

            VStack(alignment: .leading, spacing: 11) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(course.title)
                        .font(.headline)
                        .foregroundStyle(Brand.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(.tertiary)
                }
                .frame(minHeight: 42, alignment: .top)

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

private struct CourseHeroIndicator: View {
    let systemImage: String
    let titleKey: LocalizedStringKey
    let color: Color
    let identifier: String

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 13, weight: .bold))
            .symbolRenderingMode(.hierarchical)
            .foregroundStyle(color)
            .frame(width: 30, height: 30)
            .background(.ultraThinMaterial, in: Circle())
            .overlay {
                Circle()
                    .stroke(.white.opacity(0.20), lineWidth: 0.5)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(titleKey))
            .accessibilityIdentifier(identifier)
            .help(Text(titleKey))
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
                        CourseBannerFallback(course: course)
                        ProgressView().tint(.white)
                    }
                default:
                    CourseBannerFallback(course: course)
                }
            }
        } else {
            CourseBannerFallback(course: course)
        }
    }
}

private struct CourseBannerFallback: View {
    let course: CourseSummary

    private var acronym: String {
        let letters = course.title
            .split(whereSeparator: { !$0.isLetter && !$0.isNumber })
            .prefix(3)
            .compactMap(\.first)
        let value = String(letters).uppercased()
        return value.isEmpty ? String(course.code.prefix(3)).uppercased() : value
    }

    private var subjectSymbol: String {
        let title = course.title.lowercased()
        if title.contains("learning") || title.contains("intelligence") || title.contains("neural") {
            return "brain.head.profile"
        }
        if title.contains("software") || title.contains("engineering") || title.contains("economics") {
            return "chart.line.uptrend.xyaxis"
        }
        if title.contains("management") || title.contains("business") || title.contains("leadership") {
            return "person.3.fill"
        }
        if title.contains("design") || title.contains("product") || title.contains("art") {
            return "square.3.layers.3d"
        }
        let symbols = ["book.closed.fill", "graduationcap.fill", "lightbulb.max.fill", "globe.americas.fill"]
        let index = course.code.unicodeScalars.reduce(0) { $0 + Int($1.value) } % symbols.count
        return symbols[index]
    }

    private var palette: [Color] {
        let palettes: [[Color]] = [
            [Brand.evergreen, Color(red: 0.08, green: 0.22, blue: 0.20)],
            [Color(red: 0.20, green: 0.31, blue: 0.48), Color(red: 0.11, green: 0.17, blue: 0.29)],
            [Color(red: 0.48, green: 0.29, blue: 0.22), Color(red: 0.27, green: 0.16, blue: 0.13)],
            [Color(red: 0.34, green: 0.24, blue: 0.48), Color(red: 0.18, green: 0.12, blue: 0.27)],
        ]
        let index = course.code.unicodeScalars.reduce(0) { $0 + Int($1.value) } % palettes.count
        return palettes[index]
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            LinearGradient(colors: palette, startPoint: .topLeading, endPoint: .bottomTrailing)

            HStack(spacing: 18) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("CourseWise")
                        .font(.caption2.bold())
                        .textCase(.uppercase)
                        .tracking(1.8)
                        .foregroundStyle(.white.opacity(0.58))
                    Text(acronym)
                        .font(.system(size: 38, weight: .black, design: .rounded))
                        .foregroundStyle(.white.opacity(0.88))
                }

                Spacer()

                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(.white.opacity(0.12))
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(.white.opacity(0.18))
                    Image(systemName: subjectSymbol)
                        .font(.system(size: 30, weight: .semibold))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.white.opacity(0.90))
                }
                .frame(width: 68, height: 68)
            }
            .padding(.horizontal, 22)
            .padding(.top, 34)
            .padding(.bottom, 12)

            Circle()
                .fill(.white.opacity(0.08))
                .frame(width: 170, height: 170)
                .offset(x: 48, y: 88)
            Circle()
                .stroke(.white.opacity(0.10), lineWidth: 18)
                .frame(width: 98, height: 98)
                .offset(x: 10, y: 44)
        }
        .accessibilityHidden(true)
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
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let course: CourseSummary

    private let learningDestinations: [FeatureDestination] = [
        .modules,
        .materials,
        .assignments,
        .quizzes,
    ]

    private let engagementDestinations: [FeatureDestination] = [
        .announcements,
        .discussions,
        .attendance,
        .grades,
        .messages,
    ]

    private var toolColumns: [GridItem] {
        [
            GridItem(
                .adaptive(
                    minimum: horizontalSizeClass == .regular ? 220 : 150,
                    maximum: 350
                ),
                spacing: 16,
                alignment: .top
            ),
        ]
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                CourseHubHero(course: course, isRegularWidth: horizontalSizeClass == .regular)

                CourseHubMetrics(course: course)

                CourseHubToolSection(
                    titleKey: "course.dashboard.learning",
                    subtitleKey: "course.dashboard.learningHelp",
                    destinations: learningDestinations,
                    course: course,
                    columns: toolColumns
                )

                CourseHubToolSection(
                    titleKey: "course.dashboard.engagement",
                    subtitleKey: "course.dashboard.engagementHelp",
                    destinations: engagementDestinations,
                    course: course,
                    columns: toolColumns
                )

                CourseHubInformation(course: course)
            }
            .padding(.horizontal, horizontalSizeClass == .regular ? 28 : 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
            .frame(maxWidth: 1100, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(CourseHubBackground())
        .navigationTitle(course.code)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Brand.paper, for: .navigationBar)
        .accessibilityIdentifier("course.hub")
    }
}

private struct CourseHubBackground: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Brand.paper
            RadialGradient(
                colors: [Brand.evergreen.opacity(0.09), .clear],
                center: .topTrailing,
                startRadius: 20,
                endRadius: 480
            )
        }
        .ignoresSafeArea()
    }
}

private struct CourseHubHero: View {
    let course: CourseSummary
    let isRegularWidth: Bool

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

    private var statusSymbol: String {
        switch course.status {
        case "active": "checkmark"
        case "draft": "pencil"
        case "archived": "archivebox.fill"
        default: "questionmark"
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
            ZStack {
                CourseBanner(course: course)
                LinearGradient(
                    colors: [.black.opacity(0.20), .clear, .black.opacity(0.12)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            }
            .frame(height: isRegularWidth ? 190 : 162)
            .overlay(alignment: .top) {
                HStack(spacing: 8) {
                    Text(course.code)
                        .font(.caption.bold().monospaced())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 11)
                        .frame(height: 32)
                        .background(.black.opacity(0.34), in: Capsule())

                    Spacer()

                    HStack(spacing: 8) {
                        CourseHeroIndicator(
                            systemImage: statusSymbol,
                            titleKey: statusKey,
                            color: statusColor,
                            identifier: "course.hub.status"
                        )
                        if course.lmsProvider == "canvas" {
                            CourseHeroIndicator(
                                systemImage: "circle.grid.3x3.fill",
                                titleKey: "courses.canvas",
                                color: .blue,
                                identifier: "course.hub.canvas"
                            )
                        }
                    }
                }
                .padding(18)
            }
            .clipped()

            VStack(alignment: .leading, spacing: 12) {
                Text("course.dashboard.overview")
                    .font(.caption.bold())
                    .textCase(.uppercase)
                    .tracking(1.2)
                    .foregroundStyle(Brand.evergreen)

                Text(course.title)
                    .font(isRegularWidth ? .largeTitle.bold() : .title2.bold())
                    .foregroundStyle(Brand.ink)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 12) {
                    if let term = course.term {
                        Label(term, systemImage: "calendar")
                    }
                    if let scheduleText {
                        Label(scheduleText, systemImage: "calendar.badge.clock")
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.78)
            }
            .padding(20)
        }
        .background(.background, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(Brand.ink.opacity(0.08))
        }
        .shadow(color: Brand.ink.opacity(0.08), radius: 18, y: 9)
        .accessibilityIdentifier("course.hub.hero")
    }

    private func formattedDate(_ value: String?) -> String? {
        guard let value else { return nil }
        let date = (try? Date(value, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
            ?? (try? Date(value, strategy: .iso8601))
        return date?.formatted(date: .abbreviated, time: .omitted)
    }
}

private struct CourseHubMetrics: View {
    let course: CourseSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            CourseHubSectionHeader(
                titleKey: "course.dashboard.statistics",
                subtitleKey: "course.dashboard.statisticsHelp"
            )

            HStack(spacing: 0) {
                CourseHubMetric(
                    icon: "square.grid.2x2",
                    value: course.counts.modules,
                    labelKey: "courses.metric.modules"
                )
                CourseHubMetricDivider()
                CourseHubMetric(
                    icon: "checklist",
                    value: course.counts.assignments,
                    labelKey: "courses.metric.assignments"
                )
                CourseHubMetricDivider()
                CourseHubMetric(
                    icon: "rectangle.on.rectangle.angled",
                    value: course.counts.presentations,
                    labelKey: "courses.metric.presentations"
                )
                CourseHubMetricDivider()
                CourseHubMetric(
                    icon: "person.2",
                    value: course.counts.students,
                    labelKey: "courses.metric.students"
                )
            }
            .padding(.vertical, 14)
            .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(18)
        .background(.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .accessibilityIdentifier("course.hub.metrics")
    }
}

private struct CourseHubMetricDivider: View {
    var body: some View {
        Divider()
            .frame(height: 54)
    }
}

private struct CourseHubMetric: View {
    let icon: String
    let value: Int
    let labelKey: LocalizedStringKey

    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Brand.evergreen)
            Text(value, format: .number)
                .font(.headline)
                .monospacedDigit()
            Text(labelKey)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(labelKey))
        .accessibilityValue(Text(value, format: .number))
    }
}

private struct CourseHubToolSection: View {
    let titleKey: LocalizedStringKey
    let subtitleKey: LocalizedStringKey
    let destinations: [FeatureDestination]
    let course: CourseSummary
    let columns: [GridItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            CourseHubSectionHeader(titleKey: titleKey, subtitleKey: subtitleKey)

            LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                ForEach(destinations) { destination in
                    NavigationLink {
                        CourseDestinationView(destination: destination, course: course)
                    } label: {
                        CourseHubFeatureCard(destination: destination, course: course)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("course.feature.\(destination.rawValue)")
                }
            }
        }
        .accessibilityIdentifier("course.hub.section.\(destinations.first?.rawValue ?? "tools")")
    }
}

private struct CourseHubSectionHeader: View {
    let titleKey: LocalizedStringKey
    let subtitleKey: LocalizedStringKey

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(titleKey)
                .font(.title2.bold())
                .foregroundStyle(Brand.ink)
            Text(subtitleKey)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

private struct CourseHubFeatureCard: View {
    let destination: FeatureDestination
    let course: CourseSummary

    private var metric: (value: Int, labelKey: LocalizedStringKey)? {
        switch destination {
        case .modules: (course.counts.modules, "courses.metric.modules")
        case .materials: (course.counts.presentations, "courses.metric.presentations")
        case .assignments: (course.counts.assignments, "courses.metric.assignments")
        default: nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                Image(systemName: destination.systemImage)
                    .font(.headline.weight(.semibold))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(Brand.evergreen)
                    .frame(width: 40, height: 40)
                    .background(
                        Brand.evergreen.opacity(0.11),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                    )

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }

            Text(destination.titleKey)
                .font(.headline)
                .foregroundStyle(Brand.ink)

            if let metric {
                HStack(spacing: 5) {
                    Text(metric.value, format: .number)
                        .fontWeight(.bold)
                        .monospacedDigit()
                    Text(metric.labelKey)
                }
                .font(.caption)
                .foregroundStyle(Brand.evergreen)
            } else {
                Text(destination.dashboardDescriptionKey)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 142, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct CourseHubInformation: View {
    let course: CourseSummary

    private var descriptionText: String {
        guard let description = course.description, !description.isEmpty else {
            return String(localized: "courses.description.unavailable")
        }
        return description
    }

    private var statusKey: LocalizedStringKey {
        switch course.status {
        case "active": "courses.status.active"
        case "draft": "courses.status.draft"
        case "archived": "courses.status.archived"
        default: "courses.status.unknown"
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

    private var informationColumns: [GridItem] {
        [GridItem(.adaptive(minimum: 180), spacing: 12)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            CourseHubSectionHeader(
                titleKey: "course.dashboard.information",
                subtitleKey: "course.dashboard.informationHelp"
            )

            Text(descriptionText)
                .font(.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Divider()

            LazyVGrid(columns: informationColumns, alignment: .leading, spacing: 12) {
                CourseHubInfoItem(
                    icon: "calendar",
                    titleKey: "course.dashboard.term",
                    value: course.term.map { Text($0) } ?? Text("course.dashboard.notProvided")
                )
                CourseHubInfoItem(
                    icon: "calendar.badge.clock",
                    titleKey: "course.dashboard.schedule",
                    value: scheduleText.map { Text($0) } ?? Text("course.dashboard.notProvided")
                )
                CourseHubInfoItem(
                    icon: "checkmark.seal",
                    titleKey: "course.dashboard.status",
                    value: Text(statusKey)
                )
                CourseHubInfoItem(
                    icon: "circle.grid.3x3.fill",
                    titleKey: "course.dashboard.integration",
                    value: course.lmsProvider == "canvas"
                        ? Text("courses.canvas")
                        : Text("course.dashboard.notConnected")
                )
            }
        }
        .padding(20)
        .background(.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .accessibilityIdentifier("course.hub.information")
    }

    private func formattedDate(_ value: String?) -> String? {
        guard let value else { return nil }
        let date = (try? Date(value, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
            ?? (try? Date(value, strategy: .iso8601))
        return date?.formatted(date: .abbreviated, time: .omitted)
    }
}

private struct CourseHubInfoItem: View {
    let icon: String
    let titleKey: LocalizedStringKey
    let value: Text

    var body: some View {
        HStack(spacing: 11) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.evergreen)
                .frame(width: 36, height: 36)
                .background(
                    Brand.evergreen.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: 11, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(titleKey)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                value
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
        .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
