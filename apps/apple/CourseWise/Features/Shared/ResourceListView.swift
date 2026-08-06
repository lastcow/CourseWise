import SwiftUI

struct ResourceListView: View {
    @Environment(AuthStore.self) private var authStore
    let destination: FeatureDestination
    var courseID: UUID?
    var course: CourseSummary?

    @State private var resources: [ResourceSummary] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let path = endpoint {
                resourceContent(path: path)
            } else {
                ContentUnavailableView(
                    destination.titleKey,
                    systemImage: destination.systemImage,
                    description: Text("common.empty")
                )
            }
        }
        .navigationTitle(destination.titleKey)
        .task(id: endpoint) {
            guard let path = endpoint else { return }
            await load(path: path)
        }
    }

    @ViewBuilder
    private func resourceContent(path: String) -> some View {
        if isLoading && resources.isEmpty {
            ProgressView("common.loading")
                .accessibilityIdentifier("resource.loading.\(destination.rawValue)")
        } else if let errorMessage, resources.isEmpty {
            ContentUnavailableView {
                Label("common.error", systemImage: "wifi.exclamationmark")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("common.retry") { Task { await load(path: path) } }
            }
        } else if resources.isEmpty {
            ContentUnavailableView("common.empty", systemImage: destination.systemImage)
        } else if destination == .modules, let courseID {
            ModulesDashboardView(modules: resources, courseID: courseID, course: course)
                .refreshable { await load(path: path) }
        } else {
            List(resources) { item in
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.title).font(.headline)
                    if let subtitle = item.subtitle {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                    }
                }
                .padding(.vertical, 3)
                .accessibilityIdentifier("resource.\(destination.rawValue).\(item.id)")
            }
            .accessibilityIdentifier("resource.list.\(destination.rawValue)")
            .refreshable { await load(path: path) }
        }
    }

    private var endpoint: String? {
        guard let courseID else {
            switch destination {
            case .alerts: return "/api/me/alerts"
            default: return nil
            }
        }
        switch destination {
        case .modules: return "/api/courses/\(courseID)/modules"
        case .materials: return "/api/courses/\(courseID)/materials"
        case .assignments: return "/api/courses/\(courseID)/assignments"
        case .quizzes: return "/api/courses/\(courseID)/quizzes"
        case .announcements: return "/api/courses/\(courseID)/announcements"
        case .discussions: return "/api/courses/\(courseID)/discussion-topics"
        case .messages: return "/api/courses/\(courseID)/messages/threads"
        case .attendance: return "/api/courses/\(courseID)/attendance-sessions"
        case .groups: return "/api/courses/\(courseID)/group-sets"
        case .students: return "/api/courses/\(courseID)/students"
        case .review: return "/api/courses/\(courseID)/assignments"
        case .grades: return "/api/courses/\(courseID)/final-grades"
        default: return nil
        }
    }

    private func load(path: String) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
#if DEBUG
            if let fixture = UITestFixture.current, destination == .modules {
                // Exercise the same asynchronous state transition as a real request.
                try await Task.sleep(for: .milliseconds(500))
                resources = fixture.modules
                errorMessage = nil
                return
            }
#endif
            let api = authStore.authenticatedAPI()
            if destination == .modules, let courseID {
                resources = try await loadModules(api: api, path: path, courseID: courseID)
            } else {
                let collection: ResourceCollection = try await api.get(path)
                resources = collection.items
            }
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadModules(api: APIClient, path: String, courseID: UUID) async throws -> [ResourceSummary] {
        async let collection: ResourceCollection = api.get(path)
        async let materials = loadModuleContent(
            api: api,
            path: "/api/courses/\(courseID)/materials"
        )
        async let presentations = loadModuleContent(
            api: api,
            path: "/api/courses/\(courseID)/presentations"
        )
        async let assignments = loadModuleContent(
            api: api,
            path: "/api/courses/\(courseID)/assignments"
        )
        async let quizzes = loadModuleContent(
            api: api,
            path: "/api/courses/\(courseID)/quizzes"
        )
        async let discussions = loadModuleContent(
            api: api,
            path: "/api/courses/\(courseID)/discussion-topics"
        )

        let loaded = try await (
            collection,
            materials,
            presentations,
            assignments,
            quizzes,
            discussions
        )
        guard
            let loadedMaterials = loaded.1,
            let loadedPresentations = loaded.2,
            let loadedAssignments = loaded.3,
            let loadedQuizzes = loaded.4,
            let loadedDiscussions = loaded.5
        else {
            // Preserve the module endpoint's counts if a supplemental content
            // endpoint is temporarily unavailable.
            return loaded.0.items
        }

        return ModuleCountReconciler.reconcile(
            modules: loaded.0.items,
            materials: loadedMaterials,
            presentations: loadedPresentations,
            assignments: loadedAssignments,
            quizzes: loadedQuizzes,
            discussions: loadedDiscussions
        )
    }

    private func loadModuleContent(api: APIClient, path: String) async -> [ModuleContentSummary]? {
        do {
            return try await api.get(path)
        } catch is CancellationError {
            return nil
        } catch {
            return nil
        }
    }
}

private struct ModulesDashboardView: View {
    let modules: [ResourceSummary]
    let courseID: UUID
    let course: CourseSummary?

    private var publishedCount: Int {
        modules.count(where: { $0.status == "published" })
    }

    private var draftCount: Int {
        modules.count(where: { $0.status == "draft" })
    }

    private var scheduledCount: Int {
        modules.count(where: { $0.startAt != nil || $0.endAt != nil })
    }

    private var orderedModules: [ResourceSummary] {
        modules.sorted { lhs, rhs in
            let lhsPosition = lhs.position ?? .max
            let rhsPosition = rhs.position ?? .max
            return lhsPosition == rhsPosition
                ? lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
                : lhsPosition < rhsPosition
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                ModulesOverviewPanel(
                    course: course,
                    total: modules.count,
                    published: publishedCount,
                    drafts: draftCount,
                    scheduled: scheduledCount
                )

                VStack(alignment: .leading, spacing: 5) {
                    Text("modules.dashboard.sequence")
                        .font(.title2.bold())
                        .foregroundStyle(Brand.ink)
                    Text("modules.dashboard.sequenceHelp")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 14) {
                    ForEach(Array(orderedModules.enumerated()), id: \.element.id) { index, module in
                        NavigationLink {
                            ModuleDetailView(
                                courseID: courseID,
                                course: course,
                                module: module,
                                sequence: index + 1
                            )
                        } label: {
                            ModuleTimelineRow(module: module, sequence: index + 1)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("module.link.\(module.id)")
                    }
                }
                .background(alignment: .leading) {
                    Rectangle()
                        .fill(Brand.evergreen.opacity(0.18))
                        .frame(width: 2)
                        .padding(.leading, 18)
                        .padding(.vertical, 32)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 30)
            .frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("modules.dashboard")
        }
        .background(ModulesBackground())
        .accessibilityIdentifier("resource.list.modules")
    }
}

private struct ModulesBackground: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Brand.paper
            RadialGradient(
                colors: [Brand.evergreen.opacity(0.09), .clear],
                center: .topTrailing,
                startRadius: 20,
                endRadius: 430
            )
        }
        .ignoresSafeArea()
    }
}

private struct ModulesOverviewPanel: View {
    let course: CourseSummary?
    let total: Int
    let published: Int
    let drafts: Int
    let scheduled: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 14) {
                Image(systemName: "point.3.connected.trianglepath.dotted")
                    .font(.title2.weight(.semibold))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(Brand.evergreen)
                    .frame(width: 52, height: 52)
                    .background(
                        Brand.evergreen.opacity(0.11),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("modules.dashboard.title")
                        .font(.title3.bold())
                        .foregroundStyle(Brand.ink)
                    if let course {
                        Text("\(course.code) · \(course.title)")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    } else {
                        Text("modules.dashboard.subtitle")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer(minLength: 0)
            }

            Divider()

            HStack(spacing: 0) {
                ModuleOverviewMetric(value: total, labelKey: "modules.dashboard.total")
                ModuleOverviewDivider()
                ModuleOverviewMetric(value: published, labelKey: "modules.status.published")
                ModuleOverviewDivider()
                ModuleOverviewMetric(value: drafts, labelKey: "modules.status.draft")
                ModuleOverviewDivider()
                ModuleOverviewMetric(value: scheduled, labelKey: "modules.dashboard.scheduled")
            }
        }
        .padding(20)
        .background(.background, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .shadow(color: Brand.ink.opacity(0.06), radius: 14, y: 7)
        .accessibilityIdentifier("modules.summary")
    }
}

private struct ModuleOverviewDivider: View {
    var body: some View {
        Divider().frame(height: 46)
    }
}

private struct ModuleOverviewMetric: View {
    let value: Int
    let labelKey: LocalizedStringKey

    var body: some View {
        VStack(spacing: 4) {
            Text(value, format: .number)
                .font(.title3.bold())
                .monospacedDigit()
            Text(labelKey)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(labelKey))
        .accessibilityValue(Text(value, format: .number))
    }
}

private struct ModuleTimelineRow: View {
    let module: ResourceSummary
    let sequence: Int

    private var isClosed: Bool { module.closedAt != nil }

    private var statusKey: LocalizedStringKey {
        if isClosed { return "modules.status.closed" }
        return module.status == "published" ? "modules.status.published" : "modules.status.draft"
    }

    private var statusColor: Color {
        if isClosed { return .secondary }
        return module.status == "published" ? Brand.evergreen : .orange
    }

    private var statusSymbol: String {
        if isClosed { return "lock.fill" }
        return module.status == "published" ? "checkmark.circle.fill" : "pencil.circle.fill"
    }

    private var startDateText: String? { formattedDate(module.startAt) }
    private var endDateText: String? { formattedDate(module.endAt) }

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(sequence, format: .number)
                .font(.subheadline.bold())
                .monospacedDigit()
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(Brand.evergreen, in: Circle())
                .overlay {
                    Circle().stroke(Brand.paper, lineWidth: 4)
                }

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(module.title)
                            .font(.headline)
                            .foregroundStyle(Brand.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if let subtitle = module.subtitle, !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    Spacer(minLength: 4)

                    Label(statusKey, systemImage: statusSymbol)
                        .font(.caption2.bold())
                        .foregroundStyle(statusColor)
                        .labelStyle(.iconOnly)
                        .frame(width: 30, height: 30)
                        .background(statusColor.opacity(0.12), in: Circle())
                        .accessibilityLabel(Text(statusKey))
                }

                if let counts = module.counts {
                    ModuleContentStatistics(moduleID: module.id, counts: counts)
                }

                if startDateText != nil || endDateText != nil {
                    ModuleSessionSchedule(
                        moduleID: module.id,
                        startDate: startDateText,
                        endDate: endDateText
                    )
                }

                HStack(spacing: 8) {
                    Text("modules.dashboard.moduleNumber")
                    Text(sequence, format: .number)
                }
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(Brand.evergreen)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Brand.ink.opacity(0.07))
            }
            .opacity(isClosed ? 0.70 : 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("resource.modules.\(module.id)")
    }

    private func formattedDate(_ value: String?) -> String? {
        guard let value else { return nil }
        let date = (try? Date(value, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
            ?? (try? Date(value, strategy: .iso8601))
        return date?.formatted(date: .abbreviated, time: .omitted)
    }
}

private struct ModuleContentStatistics: View {
    let moduleID: String
    let counts: ModuleContentCounts

    private var teachingMaterials: Int {
        counts.materials + counts.presentations
    }

    var body: some View {
        HStack(spacing: 7) {
            ModuleContentMetric(
                systemImage: "books.vertical.fill",
                value: teachingMaterials,
                labelKey: "modules.content.materials",
                identifier: "module.statistics.\(moduleID).materials"
            )
            ModuleContentMetric(
                systemImage: "checklist",
                value: counts.assignments,
                labelKey: "modules.content.assignments",
                identifier: "module.statistics.\(moduleID).assignments"
            )
            ModuleContentMetric(
                systemImage: "questionmark.circle.fill",
                value: counts.quizzes,
                labelKey: "modules.content.quizzes",
                identifier: "module.statistics.\(moduleID).quizzes"
            )
            ModuleContentMetric(
                systemImage: "bubble.left.and.bubble.right.fill",
                value: counts.discussions,
                labelKey: "modules.content.discussions",
                identifier: "module.statistics.\(moduleID).discussions"
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("module.statistics.\(moduleID)")
    }
}

private struct ModuleContentMetric: View {
    let systemImage: String
    let value: Int
    let labelKey: LocalizedStringKey
    let identifier: String

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Brand.evergreen)
                Text(value, format: .number)
                    .font(.subheadline.bold())
                    .monospacedDigit()
                    .foregroundStyle(Brand.ink)
            }

            Text(labelKey)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.70)
        }
        .padding(.horizontal, 3)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Brand.evergreen.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(labelKey))
        .accessibilityValue(Text(value, format: .number))
        .accessibilityIdentifier(identifier)
    }
}

private struct ModuleSessionSchedule: View {
    let moduleID: String
    let startDate: String?
    let endDate: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("modules.schedule.session", systemImage: "calendar.badge.clock")
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.7)
                .foregroundStyle(Brand.evergreen)

            VStack(spacing: 0) {
                if let startDate {
                    ModuleSessionDate(
                        labelKey: "modules.schedule.starts",
                        value: startDate,
                        identifier: "module.schedule.start.\(moduleID)"
                    )
                }

                if startDate != nil, endDate != nil {
                    Divider()
                }

                if let endDate {
                    ModuleSessionDate(
                        labelKey: "modules.schedule.ends",
                        value: endDate,
                        identifier: "module.schedule.end.\(moduleID)"
                    )
                }
            }
            .padding(.horizontal, 10)
            .background(.background.opacity(0.72), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("module.schedule.\(moduleID)")
    }
}

private struct ModuleSessionDate: View {
    let labelKey: LocalizedStringKey
    let value: String
    let identifier: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(labelKey)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(minWidth: 42, alignment: .leading)

            Spacer(minLength: 8)

            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
                .minimumScaleFactor(0.82)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }
}

private struct ModuleDetailView: View {
    @Environment(AuthStore.self) private var authStore
    let courseID: UUID
    let course: CourseSummary?
    let module: ResourceSummary
    let sequence: Int

    @State private var materials: [ModuleContentSummary] = []
    @State private var presentations: [ModuleContentSummary] = []
    @State private var assignments: [ModuleContentSummary] = []
    @State private var quizzes: [ModuleContentSummary] = []
    @State private var discussions: [ModuleContentSummary] = []
    @State private var isLoading = false
    @State private var hasLoadedContent = false
    @State private var errorMessage: String?

    private var teachingMaterials: [ModuleDetailEntry] {
        materials.map { ModuleDetailEntry(kind: .material, item: $0) }
            + presentations.map { ModuleDetailEntry(kind: .presentation, item: $0) }
    }

    private var heroCounts: ModuleContentCounts {
        if !hasLoadedContent {
            return module.counts ?? ModuleContentCounts(
                materials: 0,
                presentations: 0,
                assignments: 0,
                quizzes: 0,
                discussions: 0
            )
        }
        return ModuleContentCounts(
            materials: materials.count,
            presentations: presentations.count,
            assignments: assignments.count,
            quizzes: quizzes.count,
            discussions: discussions.count
        )
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                ModuleDetailHero(
                    course: course,
                    module: module,
                    sequence: sequence,
                    counts: heroCounts
                )

                if isLoading && teachingMaterials.isEmpty && assignments.isEmpty {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("modules.detail.loading")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                    .accessibilityIdentifier("module.detail.loading")
                } else if let errorMessage,
                          teachingMaterials.isEmpty,
                          assignments.isEmpty,
                          quizzes.isEmpty,
                          discussions.isEmpty {
                    ModuleDetailError(message: errorMessage) {
                        Task { await load() }
                    }
                } else {
                    ModuleDetailSection(
                        titleKey: "modules.detail.materials",
                        helpKey: "modules.detail.materialsHelp",
                        systemImage: "books.vertical.fill",
                        accentColor: .teal,
                        entries: teachingMaterials,
                        identifier: "module.detail.section.materials"
                    )
                    ModuleDetailSection(
                        titleKey: "modules.detail.assignments",
                        helpKey: "modules.detail.assignmentsHelp",
                        systemImage: "checklist",
                        accentColor: .orange,
                        entries: assignments.map { ModuleDetailEntry(kind: .assignment, item: $0) },
                        identifier: "module.detail.section.assignments"
                    )
                    ModuleDetailSection(
                        titleKey: "modules.detail.quizzes",
                        helpKey: "modules.detail.quizzesHelp",
                        systemImage: "questionmark.circle.fill",
                        accentColor: .blue,
                        entries: quizzes.map { ModuleDetailEntry(kind: .quiz, item: $0) },
                        identifier: "module.detail.section.quizzes"
                    )
                    ModuleDetailSection(
                        titleKey: "modules.detail.discussions",
                        helpKey: "modules.detail.discussionsHelp",
                        systemImage: "bubble.left.and.bubble.right.fill",
                        accentColor: .purple,
                        entries: discussions.map { ModuleDetailEntry(kind: .discussion, item: $0) },
                        identifier: "module.detail.section.discussions"
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 34)
            .frame(maxWidth: 900, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(ModulesBackground())
        .navigationTitle("modules.detail.navigation")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: module.id) { await load() }
        .accessibilityIdentifier("module.detail")
    }

    private func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
#if DEBUG
            if let fixture = UITestFixture.current {
                try await Task.sleep(for: .milliseconds(350))
                materials = filtered(fixture.materials)
                presentations = filtered(fixture.presentations)
                assignments = filtered(fixture.assignments)
                quizzes = filtered(fixture.quizzes)
                discussions = filtered(fixture.discussions)
                hasLoadedContent = true
                errorMessage = nil
                return
            }
#endif
            let api = authStore.authenticatedAPI()
            async let loadedMaterials: [ModuleContentSummary] = api.get(
                "/api/courses/\(courseID)/materials"
            )
            async let loadedPresentations: [ModuleContentSummary] = api.get(
                "/api/courses/\(courseID)/presentations"
            )
            async let loadedAssignments: [ModuleContentSummary] = api.get(
                "/api/courses/\(courseID)/assignments"
            )
            async let loadedQuizzes: [ModuleContentSummary] = api.get(
                "/api/courses/\(courseID)/quizzes"
            )
            async let loadedDiscussions: [ModuleContentSummary] = api.get(
                "/api/courses/\(courseID)/discussion-topics"
            )

            let values = try await (
                loadedMaterials,
                loadedPresentations,
                loadedAssignments,
                loadedQuizzes,
                loadedDiscussions
            )
            materials = filtered(values.0)
            presentations = filtered(values.1)
            assignments = filtered(values.2)
            quizzes = filtered(values.3)
            discussions = filtered(values.4)
            hasLoadedContent = true
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func filtered(_ values: [ModuleContentSummary]) -> [ModuleContentSummary] {
        values
            .filter { $0.moduleID == module.id }
            .sorted { lhs, rhs in
                let lhsPosition = lhs.position ?? .max
                let rhsPosition = rhs.position ?? .max
                return lhsPosition == rhsPosition
                    ? lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
                    : lhsPosition < rhsPosition
            }
    }
}

private struct ModuleDetailHero: View {
    let course: CourseSummary?
    let module: ResourceSummary
    let sequence: Int
    let counts: ModuleContentCounts

    private var isClosed: Bool { module.closedAt != nil }

    private var statusKey: LocalizedStringKey {
        if isClosed { return "modules.status.closed" }
        return module.status == "published" ? "modules.status.published" : "modules.status.draft"
    }

    private var statusSymbol: String {
        if isClosed { return "lock.fill" }
        return module.status == "published" ? "checkmark.circle.fill" : "pencil.circle.fill"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 10) {
                    if let course {
                        Text("\(course.code) · \(course.title)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.82))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Label(statusKey, systemImage: statusSymbol)
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(.white.opacity(0.14), in: Capsule())
                }

                HStack(alignment: .top, spacing: 15) {
                    VStack(spacing: 0) {
                        Text("modules.dashboard.moduleNumber")
                            .font(.caption2.weight(.semibold))
                            .textCase(.uppercase)
                        Text(sequence, format: .number)
                            .font(.title.bold())
                            .monospacedDigit()
                    }
                    .foregroundStyle(Brand.evergreen)
                    .frame(width: 68, height: 68)
                    .background(.white, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

                    VStack(alignment: .leading, spacing: 7) {
                        Text(module.title)
                            .font(.title2.bold())
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        if let subtitle = module.subtitle, !subtitle.isEmpty {
                            Text(subtitle)
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.78))
                                .lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .padding(20)
            .background {
                LinearGradient(
                    colors: [Brand.evergreen, Brand.evergreen.opacity(0.82)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

            VStack(alignment: .leading, spacing: 14) {
                ModuleContentStatistics(moduleID: "detail.\(module.id)", counts: counts)

                let start = formattedModuleDate(module.startAt)
                let end = formattedModuleDate(module.endAt)
                if start != nil || end != nil {
                    ModuleSessionSchedule(
                        moduleID: "detail.\(module.id)",
                        startDate: start,
                        endDate: end
                    )
                }
            }
            .padding(16)
            .background(.background)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .shadow(color: Brand.ink.opacity(0.10), radius: 18, y: 9)
        .accessibilityIdentifier("module.detail.hero")
    }
}

private enum ModuleDetailKind: String {
    case material
    case presentation
    case assignment
    case quiz
    case discussion

    var systemImage: String {
        switch self {
        case .material: "doc.text.fill"
        case .presentation: "rectangle.on.rectangle.angled"
        case .assignment: "checklist"
        case .quiz: "questionmark.circle.fill"
        case .discussion: "bubble.left.and.bubble.right.fill"
        }
    }

    var labelKey: LocalizedStringKey {
        switch self {
        case .material: "modules.detail.material"
        case .presentation: "modules.detail.presentation"
        case .assignment: "modules.detail.assignment"
        case .quiz: "modules.detail.quiz"
        case .discussion: "modules.detail.discussion"
        }
    }

    var accentColor: Color {
        switch self {
        case .material, .presentation: .teal
        case .assignment: .orange
        case .quiz: .blue
        case .discussion: .purple
        }
    }
}

private struct ModuleDetailEntry: Identifiable {
    let kind: ModuleDetailKind
    let item: ModuleContentSummary

    var id: String { "\(kind.rawValue).\(item.id)" }
}

private struct ModuleDetailSection: View {
    let titleKey: LocalizedStringKey
    let helpKey: LocalizedStringKey
    let systemImage: String
    let accentColor: Color
    let entries: [ModuleDetailEntry]
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .center, spacing: 11) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(accentColor)
                    .frame(width: 38, height: 38)
                    .background(accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 3) {
                    Text(titleKey)
                        .font(.title3.bold())
                        .foregroundStyle(Brand.ink)
                    Text(helpKey)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)
            }

            if entries.isEmpty {
                HStack(spacing: 9) {
                    Image(systemName: "tray")
                    Text("modules.detail.empty")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 16))
            } else {
                VStack(spacing: 10) {
                    ForEach(entries) { entry in
                        NavigationLink {
                            ModuleResourceDetailView(entry: entry)
                        } label: {
                            ModuleDetailResourceCard(entry: entry)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(identifier)
    }
}

private struct ModuleDetailResourceCard: View {
    let entry: ModuleDetailEntry

    private var accessibilitySummary: String {
        facts.prefix(6).map { fact in
            let label = String(localized: String.LocalizationValue(fact.labelKey))
            return "\(label): \(fact.value)"
        }
        .joined(separator: ", ")
    }

    private var facts: [ModuleDetailFact] {
        var values: [ModuleDetailFact] = []
        let item = entry.item

        switch entry.kind {
        case .material:
            if let type = item.type { values.append(.init("doc", "modules.detail.type", humanized(type))) }
            if let source = item.sourceType { values.append(.init("square.and.arrow.down", "modules.detail.source", humanized(source))) }
        case .presentation:
            if let slides = item.slideCount { values.append(.init("rectangle.stack", "modules.detail.slides", slides.formatted())) }
            if let provider = item.provider { values.append(.init("sparkles", "modules.detail.provider", humanized(provider))) }
            if let shared = item.shareEnabled { values.append(.init("person.2", "modules.detail.sharing", yesNo(shared))) }
        case .assignment:
            if let submissions = item.submissionCount {
                values.append(.init("paperplane.fill", "modules.detail.submissions", submissions.formatted()))
            }
            if let submissions = item.submissionCount,
               let ungraded = item.ungradedSubmissionCount {
                values.append(
                    .init(
                        "checkmark.seal.fill",
                        "modules.detail.graded",
                        max(submissions - ungraded, 0).formatted()
                    )
                )
            }
            if let ungraded = item.ungradedSubmissionCount {
                values.append(.init("clock.badge.exclamationmark", "modules.detail.needsGrading", ungraded.formatted()))
            }
            if let submission = item.mySubmission {
                values.append(
                    .init(
                        "person.crop.circle.badge.checkmark",
                        "modules.detail.mySubmission",
                        localizedSubmissionStatus(submission.status)
                    )
                )
                if let submitted = formattedModuleDate(submission.submittedAt, includeTime: true) {
                    values.append(.init("paperplane", "modules.detail.submittedAt", submitted))
                }
                if let earned = submission.score {
                    let result = item.maxScore.map { "\(score(earned)) / \(score($0))" } ?? score(earned)
                    values.append(.init("star.fill", "modules.detail.score", result))
                }
            }
            if let opens = formattedModuleDate(item.startDate, includeTime: true) { values.append(.init("door.left.hand.open", "modules.detail.opens", opens)) }
            if let due = formattedModuleDate(item.dueDate, includeTime: true) { values.append(.init("calendar", "modules.detail.due", due)) }
            if let closes = formattedModuleDate(item.untilDate ?? item.endDate, includeTime: true) { values.append(.init("door.left.hand.closed", "modules.detail.closes", closes)) }
            if let points = item.maxScore { values.append(.init("star", "modules.detail.points", score(points))) }
            if let mode = item.submissionMode { values.append(.init("person", "modules.detail.submission", humanized(mode))) }
            if let late = item.allowLateSubmission { values.append(.init("clock.arrow.circlepath", "modules.detail.late", yesNo(late))) }
        case .quiz:
            if let attempts = item.attemptCount { values.append(.init("person.2.fill", "modules.detail.quizAttempts", attempts.formatted())) }
            if let pending = item.pendingReviewCount { values.append(.init("clock.badge.questionmark", "modules.detail.needsReview", pending.formatted())) }
            if let opens = formattedModuleDate(item.startTime, includeTime: true) { values.append(.init("door.left.hand.open", "modules.detail.opens", opens)) }
            if let closes = formattedModuleDate(item.untilDate ?? item.endTime, includeTime: true) { values.append(.init("door.left.hand.closed", "modules.detail.closes", closes)) }
            if let questions = item.questionCount { values.append(.init("questionmark.circle", "modules.detail.questions", questions.formatted())) }
            if let minutes = item.timeLimitMinutes { values.append(.init("timer", "modules.detail.minutes", minutes.formatted())) }
            if let attempts = item.maxAttempts { values.append(.init("arrow.counterclockwise", "modules.detail.allowedAttempts", attempts.formatted())) }
            if let points = item.maxScore { values.append(.init("star", "modules.detail.points", score(points))) }
            if let passing = item.passingScore { values.append(.init("checkmark.seal", "modules.detail.passing", score(passing))) }
            if let lockdown = item.lockdown { values.append(.init("lock.shield", "modules.detail.lockdown", yesNo(lockdown))) }
        case .discussion:
            if let posts = item.postCount { values.append(.init("bubble.left", "modules.detail.posts", posts.formatted())) }
            if let pinned = item.isPinned { values.append(.init("pin", "modules.detail.pinned", yesNo(pinned))) }
            if let graded = item.isGraded { values.append(.init("checkmark.seal", "modules.detail.graded", yesNo(graded))) }
            if let points = item.maxScore { values.append(.init("star", "modules.detail.points", score(points))) }
        }

        if let published = formattedModuleDate(item.publishedAt) {
            values.append(.init("calendar.badge.checkmark", "modules.detail.published", published))
        }
        if let closed = formattedModuleDate(item.closedAt, includeTime: true) {
            values.append(.init("lock", "modules.detail.closed", closed))
        }
        if let archived = formattedModuleDate(item.archivedAt) {
            values.append(.init("archivebox", "modules.detail.archived", archived))
        }
        return values
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: entry.kind.systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(entry.kind.accentColor)
                    .frame(width: 34, height: 34)
                    .background(entry.kind.accentColor.opacity(0.11), in: RoundedRectangle(cornerRadius: 10))

                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.kind.labelKey)
                        .font(.caption2.weight(.semibold))
                        .textCase(.uppercase)
                        .tracking(0.6)
                        .foregroundStyle(Brand.evergreen)
                    Text(entry.item.title)
                        .font(.headline)
                        .foregroundStyle(Brand.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 6)

                if let status = entry.item.status {
                    Text(localizedStatus(status))
                        .font(.caption2.bold())
                        .foregroundStyle(Brand.evergreen)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .background(Brand.evergreen.opacity(0.09), in: Capsule())
                }
            }

            if !facts.isEmpty {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 92), spacing: 6)],
                    alignment: .leading,
                    spacing: 6
                ) {
                    ForEach(Array(facts.prefix(6))) { fact in
                        ModuleDetailFactTile(
                            fact: fact,
                            itemID: entry.item.id,
                            accentColor: entry.kind.accentColor
                        )
                    }
                }
            }

            HStack {
                Label(entry.kind.labelKey, systemImage: entry.kind.systemImage)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("modules.detail.open")
                    .fontWeight(.semibold)
                    .foregroundStyle(Brand.evergreen)
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .accessibilityElement(children: .contain)
        .accessibilityValue(accessibilitySummary)
        .accessibilityIdentifier("module.detail.\(entry.kind.rawValue).\(entry.item.id)")
    }

    private func humanized(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func yesNo(_ value: Bool) -> String {
        String(localized: value ? "common.yes" : "common.no")
    }

    private func score(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0 ... 2)))
    }

    private func localizedStatus(_ value: String) -> String {
        switch value {
        case "published": String(localized: "modules.status.published")
        case "draft": String(localized: "modules.status.draft")
        case "closed": String(localized: "modules.status.closed")
        case "archived": String(localized: "modules.status.archived")
        default: humanized(value)
        }
    }

    private func localizedSubmissionStatus(_ value: String) -> String {
        switch value {
        case "draft": String(localized: "submission.status.draft")
        case "submitted": String(localized: "submission.status.submitted")
        case "late": String(localized: "submission.status.late")
        case "graded": String(localized: "submission.status.graded")
        case "returned": String(localized: "submission.status.returned")
        default: humanized(value)
        }
    }
}

private struct ModuleDetailFactTile: View {
    let fact: ModuleDetailFact
    let itemID: String
    let accentColor: Color

    var body: some View {
        HStack(alignment: .top, spacing: 7) {
            Image(systemName: fact.systemImage)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(accentColor)
                .frame(width: 20, height: 20)
                .background(accentColor.opacity(0.14), in: RoundedRectangle(cornerRadius: 6))

            VStack(alignment: .leading, spacing: 1) {
                Text(LocalizedStringKey(fact.labelKey))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                Text(fact.value)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.78)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
        .padding(7)
        .background(accentColor.opacity(0.075), in: RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(accentColor.opacity(0.12))
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("module.detail.fact.\(itemID).\(fact.labelKey)")
    }
}

private struct ModuleResourceDetailView: View {
    @Environment(AuthStore.self) private var authStore
    let entry: ModuleDetailEntry

    @State private var slides: [PresentationSlideSummary] = []
    @State private var assignmentSubmissions: [AssignmentSubmissionSummary] = []
    @State private var questions: [QuizQuestionSummary] = []
    @State private var discussionPage: DiscussionPostsPage?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                resourceHero
                contentSection

                if let urlString = entry.item.externalURLString,
                   let url = URL(string: urlString),
                   ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                    Link(destination: url) {
                        Label("modules.detail.open", systemImage: "arrow.up.right.square")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 4)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Brand.evergreen)
                }

                supportingDetails
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 34)
            .frame(maxWidth: 820, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(ModulesBackground())
        .navigationTitle(entry.kind.labelKey)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: entry.id) { await loadContent() }
        .refreshable { await loadContent() }
        .accessibilityIdentifier("module.resource.detail")
    }

    private var resourceHero: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(
                colors: [entry.kind.accentColor.opacity(0.96), entry.kind.accentColor.opacity(0.72)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .fill(.white.opacity(0.09))
                .frame(width: 170, height: 170)
                .offset(x: 245, y: -95)

            HStack(alignment: .top, spacing: 14) {
                Image(systemName: entry.kind.systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(entry.kind.accentColor)
                    .frame(width: 52, height: 52)
                    .background(.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(entry.kind.labelKey)
                            .font(.caption.weight(.semibold))
                            .textCase(.uppercase)
                            .tracking(0.6)
                        Spacer()
                        if let status = entry.item.status {
                            Label(localizedModuleStatus(status), systemImage: "checkmark.circle.fill")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 9)
                                .padding(.vertical, 5)
                                .background(.white.opacity(0.16), in: Capsule())
                        }
                    }
                    .foregroundStyle(.white.opacity(0.88))

                    Text(entry.item.title)
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    if let description = heroDescription {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.82))
                            .lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(18)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .shadow(color: entry.kind.accentColor.opacity(0.16), radius: 18, y: 8)
    }

    private var heroDescription: String? {
        guard let description = entry.item.description,
              !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        guard entry.kind == .assignment else { return description }

        for block in MarkdownBlockParser.parse(description) {
            if case let .paragraph(text) = block.kind {
                return String(inlineMarkdown(text).characters)
            }
        }
        return String(inlineMarkdown(description).characters)
    }

    @ViewBuilder
    private var contentSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(contentTitle, systemImage: contentSymbol)
                .font(.title3.bold())
                .foregroundStyle(Brand.ink)

            if isLoading {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("modules.content.loading")
                }
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
            } else if let errorMessage {
                ModuleDetailError(message: errorMessage) {
                    Task { await loadContent() }
                }
            } else {
                switch entry.kind {
                case .material:
                    MarkdownContentPanel(
                        text: entry.item.content ?? entry.item.description,
                        accentColor: entry.kind.accentColor
                    )
                case .assignment:
                    AssignmentResourceContent(
                        assignment: entry.item,
                        submissions: assignmentSubmissions,
                        canViewAllSubmissions: authStore.account?.role != .student
                    )
                case .presentation:
                    if slides.isEmpty {
                        EmptyContentPanel()
                    } else {
                        PresentationDeckView(slides: slides)
                    }
                case .quiz:
                    if questions.isEmpty {
                        EmptyContentPanel()
                    } else {
                        ForEach(questions.sorted { $0.position < $1.position }) { question in
                            QuizQuestionCard(question: question)
                        }
                    }
                case .discussion:
                    MarkdownContentPanel(
                        text: entry.item.description,
                        accentColor: entry.kind.accentColor
                    )
                    if let posts = discussionPage?.posts, !posts.isEmpty {
                        ForEach(posts) { post in
                            DiscussionPostCard(post: post)
                        }
                    } else {
                        EmptyContentPanel()
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("module.resource.content")
    }

    private var contentTitle: LocalizedStringKey {
        switch entry.kind {
        case .material: "modules.content.reading"
        case .presentation: "modules.content.slides"
        case .assignment: "modules.content.instructions"
        case .quiz: "modules.content.questions"
        case .discussion: "modules.content.conversation"
        }
    }

    private var contentSymbol: String {
        switch entry.kind {
        case .material: "text.alignleft"
        case .presentation: "rectangle.stack"
        case .assignment: "list.bullet.clipboard"
        case .quiz: "list.number"
        case .discussion: "bubble.left.and.text.bubble.right"
        }
    }

    private var supportingDetails: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("modules.content.details", systemImage: "info.circle")
                .font(.headline)
                .foregroundStyle(Brand.ink)

            if compactFacts.isEmpty {
                Text("modules.content.noDetails")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(compactFacts) { fact in
                    HStack(spacing: 10) {
                        Image(systemName: fact.systemImage)
                            .foregroundStyle(Brand.evergreen)
                            .frame(width: 22)
                        Text(LocalizedStringKey(fact.labelKey))
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(fact.value)
                            .fontWeight(.semibold)
                            .multilineTextAlignment(.trailing)
                    }
                    .font(.subheadline)
                }
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Brand.ink.opacity(0.07)) }
    }

    private var compactFacts: [ModuleDetailFact] {
        var facts: [ModuleDetailFact] = []
        let item = entry.item
        if let due = formattedModuleDate(item.dueDate, includeTime: true) {
            facts.append(.init("calendar", "modules.detail.due", due))
        }
        if let points = item.maxScore {
            facts.append(.init("star", "modules.detail.points", points.formatted()))
        }
        if let minutes = item.timeLimitMinutes {
            facts.append(.init("timer", "modules.detail.minutes", minutes.formatted()))
        }
        if let attempts = item.maxAttempts {
            facts.append(.init("arrow.counterclockwise", "modules.detail.attempts", attempts.formatted()))
        }
        if let published = formattedModuleDate(item.publishedAt) {
            facts.append(.init("calendar.badge.checkmark", "modules.detail.published", published))
        }
        return facts
    }

    private func loadContent() async {
        guard !isLoading else { return }
        guard [.presentation, .assignment, .quiz, .discussion].contains(entry.kind) else { return }
        isLoading = true
        defer { isLoading = false }

        do {
#if DEBUG
            if let fixture = UITestFixture.current {
                try await Task.sleep(for: .milliseconds(250))
                slides = fixture.presentationSlides[entry.item.id] ?? []
                assignmentSubmissions = fixture.assignmentSubmissions[entry.item.id] ?? []
                questions = fixture.quizQuestions[entry.item.id] ?? []
                discussionPage = fixture.discussionPosts[entry.item.id]
                errorMessage = nil
                return
            }
#endif
            let api = authStore.authenticatedAPI()
            switch entry.kind {
            case .presentation:
                slides = try await api.get("/api/presentations/\(entry.item.id)/slides")
            case .assignment:
                if authStore.account?.role != .student {
                    assignmentSubmissions = try await api.get(
                        "/api/assignments/\(entry.item.id)/submissions"
                    )
                }
            case .quiz:
                questions = try await api.get("/api/quizzes/\(entry.item.id)/questions")
            case .discussion:
                discussionPage = try await api.get(
                    "/api/discussion-topics/\(entry.item.id)/posts?rootLimit=20"
                )
            case .material:
                break
            }
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct MarkdownContentPanel: View {
    let text: String?
    let accentColor: Color

    var body: some View {
        if let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            RichMarkdownView(text: text, accentColor: accentColor)
                .padding(18)
                .background(.background, in: RoundedRectangle(cornerRadius: 20))
                .overlay {
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(accentColor.opacity(0.14))
                }
        } else {
            EmptyContentPanel()
        }
    }
}

private struct MarkdownBlock: Identifiable {
    enum Kind {
        case heading(level: Int, text: String)
        case paragraph(String)
        case unordered([String])
        case ordered([String])
        case quote(String)
        case code(String, language: String?)
        case divider
    }

    let id: Int
    let kind: Kind
}

private enum MarkdownBlockParser {
    static func parse(_ source: String) -> [MarkdownBlock] {
        let lines = source.components(separatedBy: .newlines)
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var unordered: [String] = []
        var ordered: [String] = []
        var code: [String] = []
        var codeLanguage: String?
        var inCode = false

        func append(_ kind: MarkdownBlock.Kind) {
            blocks.append(MarkdownBlock(id: blocks.count, kind: kind))
        }
        func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            append(.paragraph(paragraph.joined(separator: " ")))
            paragraph.removeAll()
        }
        func flushLists() {
            if !unordered.isEmpty {
                append(.unordered(unordered))
                unordered.removeAll()
            }
            if !ordered.isEmpty {
                append(.ordered(ordered))
                ordered.removeAll()
            }
        }

        for rawLine in lines {
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.hasPrefix("```") {
                flushParagraph()
                flushLists()
                if inCode {
                    append(.code(code.joined(separator: "\n"), language: codeLanguage))
                    code.removeAll()
                    codeLanguage = nil
                } else {
                    let language = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                    codeLanguage = language.isEmpty ? nil : language
                }
                inCode.toggle()
                continue
            }
            if inCode {
                code.append(rawLine)
                continue
            }
            if line.isEmpty {
                flushParagraph()
                flushLists()
                continue
            }
            if ["---", "***", "___"].contains(line) {
                flushParagraph()
                flushLists()
                append(.divider)
                continue
            }

            let headingMarks = line.prefix { $0 == "#" }.count
            if (1 ... 4).contains(headingMarks),
               line.dropFirst(headingMarks).hasPrefix(" ") {
                flushParagraph()
                flushLists()
                append(.heading(
                    level: headingMarks,
                    text: String(line.dropFirst(headingMarks + 1))
                ))
                continue
            }
            if let item = unorderedItem(in: line) {
                flushParagraph()
                if !ordered.isEmpty { flushLists() }
                unordered.append(item)
                continue
            }
            if let item = orderedItem(in: line) {
                flushParagraph()
                if !unordered.isEmpty { flushLists() }
                ordered.append(item)
                continue
            }
            if line.hasPrefix("> ") {
                flushParagraph()
                flushLists()
                append(.quote(String(line.dropFirst(2))))
                continue
            }
            paragraph.append(line)
        }

        if inCode, !code.isEmpty {
            append(.code(code.joined(separator: "\n"), language: codeLanguage))
        }
        flushParagraph()
        flushLists()
        return blocks
    }

    private static func unorderedItem(in line: String) -> String? {
        for prefix in ["- ", "* ", "+ "] where line.hasPrefix(prefix) {
            return String(line.dropFirst(2))
        }
        return nil
    }

    private static func orderedItem(in line: String) -> String? {
        guard let space = line.firstIndex(of: " ") else { return nil }
        let marker = line[..<space]
        guard marker.hasSuffix(".") || marker.hasSuffix(")") else { return nil }
        guard Int(marker.dropLast()) != nil else { return nil }
        return String(line[line.index(after: space)...])
    }
}

private struct RichMarkdownView: View {
    let text: String
    let accentColor: Color

    private var blocks: [MarkdownBlock] { MarkdownBlockParser.parse(text) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(blocks) { block in
                blockView(block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func blockView(_ block: MarkdownBlock) -> some View {
        switch block.kind {
        case let .heading(level, text):
            Text(inlineMarkdown(text))
                .font(headingFont(level))
                .foregroundStyle(Brand.ink)
                .padding(.top, level == 1 ? 2 : 5)
                .accessibilityAddTraits(.isHeader)
        case let .paragraph(text):
            Text(inlineMarkdown(text))
                .font(.body)
                .foregroundStyle(Brand.ink)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        case let .unordered(items):
            VStack(alignment: .leading, spacing: 9) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Circle()
                            .fill(accentColor)
                            .frame(width: 6, height: 6)
                        Text(inlineMarkdown(item))
                            .font(.body)
                            .foregroundStyle(Brand.ink)
                    }
                }
            }
            .padding(.leading, 3)
        case let .ordered(items):
            VStack(alignment: .leading, spacing: 9) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(index + 1)")
                            .font(.caption.bold())
                            .foregroundStyle(accentColor)
                            .frame(width: 24, height: 24)
                            .background(accentColor.opacity(0.12), in: Circle())
                        Text(inlineMarkdown(item))
                            .font(.body)
                            .foregroundStyle(Brand.ink)
                    }
                }
            }
        case let .quote(text):
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(accentColor)
                    .frame(width: 4)
                Text(inlineMarkdown(text))
                    .font(.body.italic())
                    .foregroundStyle(Brand.ink.opacity(0.82))
                    .lineSpacing(4)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(accentColor.opacity(0.075), in: RoundedRectangle(cornerRadius: 12))
        case let .code(text, language):
            VStack(alignment: .leading, spacing: 8) {
                if let language {
                    Text(language.uppercased())
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    Text(text)
                        .font(.system(.subheadline, design: .monospaced))
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: true, vertical: false)
                }
            }
            .padding(13)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Brand.ink.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        case .divider:
            Divider().overlay(accentColor.opacity(0.3))
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: .title2.bold()
        case 2: .title3.bold()
        case 3: .headline
        default: .subheadline.weight(.semibold)
        }
    }
}

private func inlineMarkdown(_ source: String) -> AttributedString {
    let options = AttributedString.MarkdownParsingOptions(
        interpretedSyntax: .inlineOnlyPreservingWhitespace
    )
    return (try? AttributedString(markdown: source, options: options)) ?? AttributedString(source)
}

private struct EmptyContentPanel: View {
    var body: some View {
        Label("modules.content.empty", systemImage: "doc.text.magnifyingglass")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct PresentationDeckView: View {
    let slides: [PresentationSlideSummary]
    @State private var selection = 0

    private var orderedSlides: [PresentationSlideSummary] {
        slides.sorted { $0.position < $1.position }
    }

    private var selectedIndex: Int {
        min(max(selection, 0), max(orderedSlides.count - 1, 0))
    }

    private var selectedSlide: PresentationSlideSummary {
        orderedSlides[selectedIndex]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Label("modules.presentation.deck", systemImage: "rectangle.stack.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.blue)
                Spacer()
                Text(String(
                    format: String(localized: "modules.presentation.progressFormat"),
                    selectedIndex + 1,
                    orderedSlides.count
                ))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            }

            ProgressView(value: Double(selectedIndex + 1), total: Double(orderedSlides.count))
                .tint(.blue)

            PresentationSlideCanvas(slide: selectedSlide)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(orderedSlides.enumerated()), id: \.element.id) { index, slide in
                        Button {
                            withAnimation(.snappy) { selection = index }
                        } label: {
                            PresentationSlideThumbnail(
                                slide: slide,
                                number: index + 1,
                                isSelected: index == selectedIndex
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(
                            format: String(localized: "modules.presentation.thumbnailFormat"),
                            index + 1,
                            slide.title ?? ""
                        ))
                    }
                }
                .padding(.vertical, 2)
            }

            HStack(spacing: 12) {
                Button {
                    withAnimation(.snappy) { selection = max(selectedIndex - 1, 0) }
                } label: {
                    Label("modules.presentation.previous", systemImage: "chevron.left")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(selectedIndex == 0)

                Button {
                    withAnimation(.snappy) {
                        selection = min(selectedIndex + 1, orderedSlides.count - 1)
                    }
                } label: {
                    Label("modules.presentation.next", systemImage: "chevron.right")
                        .labelStyle(.titleAndIcon)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
                .disabled(selectedIndex == orderedSlides.count - 1)
            }

            if let notes = selectedSlide.speakerNotes, !notes.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    Label("modules.content.speakerNotes", systemImage: "person.wave.2.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.blue)
                    Text(inlineMarkdown(notes))
                        .font(.subheadline)
                        .foregroundStyle(Brand.ink.opacity(0.82))
                        .lineSpacing(3)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(.blue.opacity(0.16)) }
        .accessibilityIdentifier("module.presentation.deck")
    }
}

private struct PresentationSlideCanvas: View {
    let slide: PresentationSlideSummary

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.blue.opacity(0.94), .indigo.opacity(0.88)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Circle()
                .fill(.white.opacity(0.08))
                .frame(width: 210, height: 210)
                .offset(x: 150, y: -100)
            Circle()
                .fill(.cyan.opacity(0.12))
                .frame(width: 150, height: 150)
                .offset(x: -170, y: 105)

            VStack(alignment: .leading, spacing: 11) {
                HStack {
                    Text(String(
                        format: String(localized: "modules.content.slideNumberFormat"),
                        slide.position + 1
                    ))
                    .font(.caption.weight(.semibold))
                    if let layout = slide.layout {
                        Text("•")
                        Text(layout.replacingOccurrences(of: "_", with: " ").capitalized)
                    }
                    Spacer()
                    Image(systemName: "play.rectangle.fill")
                }
                .foregroundStyle(.white.opacity(0.72))

                Spacer(minLength: 0)
                if let title = slide.title, !title.isEmpty {
                    Text(inlineMarkdown(title))
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                        .lineLimit(3)
                        .minimumScaleFactor(0.72)
                        .accessibilityIdentifier("module.resource.slide.\(slide.id)")
                }
                if let content = slide.content, !content.isEmpty {
                    Text(inlineMarkdown(content))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.88))
                        .lineSpacing(3)
                        .lineLimit(6)
                        .minimumScaleFactor(0.72)
                }
                Spacer(minLength: 0)
            }
            .padding(20)
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.18)) }
        .shadow(color: .blue.opacity(0.16), radius: 16, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("module.resource.slide.\(slide.id)")
    }
}

private struct PresentationSlideThumbnail: View {
    let slide: PresentationSlideSummary
    let number: Int
    let isSelected: Bool

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(
                colors: [.blue.opacity(isSelected ? 0.95 : 0.66), .indigo.opacity(0.76)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            VStack(alignment: .leading, spacing: 3) {
                Text(number.formatted())
                    .font(.caption2.bold())
                    .foregroundStyle(.white.opacity(0.72))
                Text(slide.title ?? String(localized: "modules.presentation.untitled"))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
            }
            .padding(8)
        }
        .frame(width: 112, height: 68)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 3)
                .padding(-2)
        }
    }
}

private struct AssignmentResourceContent: View {
    let assignment: ModuleContentSummary
    let submissions: [AssignmentSubmissionSummary]
    let canViewAllSubmissions: Bool
    @State private var selectedTab: AssignmentContentTab = .requirements

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("modules.assignment.contentPicker", selection: $selectedTab) {
                ForEach(AssignmentContentTab.allCases) { tab in
                    Label(tab.labelKey, systemImage: tab.systemImage)
                        .tag(tab)
                }
            }
            .pickerStyle(.segmented)

            if selectedTab == .requirements {
                MarkdownContentPanel(text: assignment.description, accentColor: .orange)
            } else {
                submissionsSection
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("module.assignment.content")
    }

    private var submissionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "tray.full.fill")
                    .font(.headline)
                    .foregroundStyle(.orange)
                    .frame(width: 38, height: 38)
                    .background(.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 3) {
                    Text(LocalizedStringKey(
                        canViewAllSubmissions
                            ? "modules.assignment.submissions"
                            : "modules.assignment.mySubmission"
                    ))
                    .font(.title3.bold())
                    .foregroundStyle(Brand.ink)
                    Text(LocalizedStringKey(
                        canViewAllSubmissions
                            ? "modules.assignment.submissionsHelp"
                            : "modules.assignment.studentHelp"
                    ))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                if canViewAllSubmissions {
                    Text(submissions.count.formatted())
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .background(.orange.opacity(0.11), in: Capsule())
                        .accessibilityIdentifier("module.assignment.submission.count")
                }
            }

            Label("modules.assignment.readOnly", systemImage: "eye.fill")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)

            if canViewAllSubmissions {
                if submissions.isEmpty {
                    EmptyContentPanel()
                } else {
                    VStack(spacing: 10) {
                        ForEach(submissions) { submission in
                            NavigationLink {
                                AssignmentSubmissionDetailView(
                                    submission: submission,
                                    maxScore: assignment.maxScore
                                )
                            } label: {
                                AssignmentSubmissionRow(submission: submission)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            } else if let mine = assignment.mySubmission {
                StudentSubmissionSnapshotCard(snapshot: mine, maxScore: assignment.maxScore)
            } else {
                Text("modules.assignment.notSubmitted")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }
}

private enum AssignmentContentTab: String, CaseIterable, Identifiable {
    case requirements
    case submissions

    var id: String { rawValue }

    var labelKey: LocalizedStringKey {
        switch self {
        case .requirements: "modules.assignment.requirementsTab"
        case .submissions: "modules.assignment.submissionsTab"
        }
    }

    var systemImage: String {
        switch self {
        case .requirements: "list.bullet.clipboard"
        case .submissions: "tray.full"
        }
    }
}

private struct AssignmentSubmissionRow: View {
    let submission: AssignmentSubmissionSummary

    var body: some View {
        HStack(spacing: 12) {
            Text(initials(submission.student.name))
                .font(.subheadline.bold())
                .foregroundStyle(.orange)
                .frame(width: 42, height: 42)
                .background(.orange.opacity(0.12), in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(submission.student.name)
                    .font(.headline)
                    .foregroundStyle(Brand.ink)
                Text(submission.student.email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let submitted = formattedModuleDate(submission.submittedAt, includeTime: true) {
                        Label(submitted, systemImage: "clock")
                    }
                    if !submission.attachments.isEmpty {
                        Label(submission.attachments.count.formatted(), systemImage: "paperclip")
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 8) {
                SubmissionStatusPill(status: submission.status)
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 15))
        .overlay { RoundedRectangle(cornerRadius: 15).stroke(.orange.opacity(0.13)) }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("module.assignment.submission.\(submission.id)")
    }
}

private struct AssignmentSubmissionDetailView: View {
    let submission: AssignmentSubmissionSummary
    let maxScore: Double?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                submissionHero
                submissionTimeline

                DetailSectionHeader(
                    title: "modules.submission.response",
                    subtitle: "modules.submission.responseHelp",
                    systemImage: "doc.text.fill"
                )
                MarkdownContentPanel(text: submission.textAnswer, accentColor: .orange)

                if !submission.attachments.isEmpty {
                    DetailSectionHeader(
                        title: "modules.submission.attachments",
                        subtitle: "modules.submission.attachmentsHelp",
                        systemImage: "paperclip"
                    )
                    VStack(spacing: 10) {
                        ForEach(submission.attachments) { attachment in
                            SubmissionAttachmentRow(attachment: attachment)
                        }
                    }
                }

                if submission.score != nil || submission.feedback != nil {
                    submissionOutcome
                }

                Label("modules.assignment.readOnlyDetail", systemImage: "lock.fill")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 14))
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 34)
            .frame(maxWidth: 820)
            .frame(maxWidth: .infinity)
        }
        .background(ModulesBackground())
        .navigationTitle("modules.submission.navigation")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("module.assignment.submission.detail")
    }

    private var submissionHero: some View {
        HStack(alignment: .top, spacing: 14) {
            Text(initials(submission.student.name))
                .font(.title3.bold())
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(.orange, in: RoundedRectangle(cornerRadius: 17))
            VStack(alignment: .leading, spacing: 5) {
                Text(submission.student.name)
                    .font(.title2.bold())
                    .foregroundStyle(Brand.ink)
                Text(submission.student.email)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                SubmissionStatusPill(status: submission.status)
            }
            Spacer()
        }
        .padding(18)
        .background(.background, in: RoundedRectangle(cornerRadius: 22))
        .overlay { RoundedRectangle(cornerRadius: 22).stroke(.orange.opacity(0.16)) }
    }

    private var submissionTimeline: some View {
        HStack(spacing: 10) {
            SubmissionDetailMetric(
                title: "modules.detail.submittedAt",
                value: formattedModuleDate(submission.submittedAt, includeTime: true)
                    ?? String(localized: "modules.submission.draft"),
                systemImage: "paperplane.fill"
            )
            SubmissionDetailMetric(
                title: "modules.submission.files",
                value: submission.attachments.count.formatted(),
                systemImage: "paperclip"
            )
        }
    }

    private var submissionOutcome: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailSectionHeader(
                title: "modules.submission.outcome",
                subtitle: "modules.submission.outcomeHelp",
                systemImage: "checkmark.seal.fill"
            )
            if let score = submission.score {
                HStack {
                    Label("modules.detail.score", systemImage: "star.fill")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(scoreText(score))
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(Brand.ink)
                }
            }
            if let feedback = submission.feedback, !feedback.isEmpty {
                MarkdownContentPanel(text: feedback, accentColor: .orange)
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(.orange.opacity(0.14)) }
    }

    private func scoreText(_ score: Double) -> String {
        guard let maxScore else { return score.formatted() }
        return "\(score.formatted()) / \(maxScore.formatted())"
    }
}

private struct DetailSectionHeader: View {
    let title: LocalizedStringKey
    let subtitle: LocalizedStringKey
    let systemImage: String

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: systemImage)
                .foregroundStyle(.orange)
                .frame(width: 34, height: 34)
                .background(.orange.opacity(0.11), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline).foregroundStyle(Brand.ink)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

private struct SubmissionDetailMetric: View {
    let title: LocalizedStringKey
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        .padding(13)
        .background(.orange.opacity(0.075), in: RoundedRectangle(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).stroke(.orange.opacity(0.13)) }
    }
}

private struct SubmissionAttachmentRow: View {
    let attachment: SubmissionAttachmentSummary

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: attachmentSymbol)
                .font(.headline)
                .foregroundStyle(.orange)
                .frame(width: 40, height: 40)
                .background(.orange.opacity(0.11), in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 3) {
                Text(attachment.filename ?? String(localized: "modules.submission.attachment"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.ink)
                    .lineLimit(2)
                Text(attachmentMetadata)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(13)
        .background(.background, in: RoundedRectangle(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).stroke(Brand.ink.opacity(0.07)) }
    }

    private var attachmentSymbol: String {
        if attachment.contentType == "application/pdf" { return "doc.richtext.fill" }
        if attachment.contentType?.hasPrefix("image/") == true { return "photo.fill" }
        return "doc.fill"
    }

    private var attachmentMetadata: String {
        guard let size = attachment.sizeBytes else {
            return attachment.contentType ?? String(localized: "modules.submission.file")
        }
        return ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)
    }
}

private struct SubmissionStatusPill: View {
    let status: String

    var body: some View {
        Text(localizedSubmissionStatus(status))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(statusColor)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(statusColor.opacity(0.11), in: Capsule())
    }

    private var statusColor: Color {
        switch status.lowercased() {
        case "graded": .green
        case "late": .orange
        case "submitted": .blue
        case "returned": .purple
        default: .secondary
        }
    }
}

private struct StudentSubmissionSnapshotCard: View {
    let snapshot: AssignmentSubmissionSnapshot
    let maxScore: Double?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "paperplane.fill")
                .foregroundStyle(.orange)
                .frame(width: 38, height: 38)
                .background(.orange.opacity(0.11), in: RoundedRectangle(cornerRadius: 11))
            VStack(alignment: .leading, spacing: 4) {
                SubmissionStatusPill(status: snapshot.status)
                if let submitted = formattedModuleDate(snapshot.submittedAt, includeTime: true) {
                    Text(submitted).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if let score = snapshot.score {
                Text(maxScore.map { "\(score.formatted()) / \($0.formatted())" } ?? score.formatted())
                    .font(.headline.monospacedDigit())
            }
        }
        .padding(14)
        .background(.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 15))
    }
}

private func localizedSubmissionStatus(_ status: String) -> String {
    switch status.lowercased() {
    case "draft": String(localized: "submission.status.draft")
    case "submitted": String(localized: "submission.status.submitted")
    case "late": String(localized: "submission.status.late")
    case "graded": String(localized: "submission.status.graded")
    case "returned": String(localized: "submission.status.returned")
    default: status.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

private func localizedModuleStatus(_ status: String) -> String {
    switch status.lowercased() {
    case "published": String(localized: "modules.status.published")
    case "draft": String(localized: "modules.status.draft")
    case "closed": String(localized: "modules.status.closed")
    case "archived": String(localized: "modules.status.archived")
    default: status.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

private func initials(_ name: String) -> String {
    name.split(separator: " ")
        .prefix(2)
        .compactMap(\.first)
        .map(String.init)
        .joined()
        .uppercased()
}

private struct QuizQuestionCard: View {
    let question: QuizQuestionSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(String(format: String(localized: "modules.content.questionNumberFormat"), question.position + 1))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.evergreen)
                Spacer()
                Text(String(format: String(localized: "modules.content.pointCountFormat"), question.points.formatted()))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(question.prompt)
                .font(.headline)
                .foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let options = question.options {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                        HStack(alignment: .top, spacing: 9) {
                            Text("\(index + 1)")
                                .font(.caption.bold())
                                .frame(width: 24, height: 24)
                                .background(Brand.evergreen.opacity(0.10), in: Circle())
                            Text(option).font(.subheadline).padding(.top, 2)
                        }
                    }
                }
            }
            if let explanation = question.explanation, !explanation.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label("modules.content.explanation", systemImage: "lightbulb")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Brand.evergreen)
                    Text(explanation).font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(10)
                .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 11))
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Brand.ink.opacity(0.07)) }
        .accessibilityIdentifier("module.resource.question.\(question.id)")
    }
}

private struct DiscussionPostCard: View {
    let post: DiscussionPostSummary

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: post.parentID == nil ? "person.crop.circle.fill" : "arrow.turn.down.right")
                .font(.title3)
                .foregroundStyle(Brand.evergreen)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(post.author.name).font(.subheadline.weight(.semibold))
                    Text(post.author.role.capitalized)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(Brand.evergreen)
                    Spacer()
                    if let date = formattedModuleDate(post.createdAt, includeTime: true) {
                        Text(date).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Text(post.content ?? String(localized: "modules.content.deletedPost"))
                    .font(.body)
                    .foregroundStyle(post.isDeleted ? .secondary : Brand.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .padding(.leading, post.parentID == nil ? 0 : 18)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Brand.ink.opacity(0.07)) }
        .accessibilityIdentifier("module.resource.post.\(post.id)")
    }
}

private struct ModuleDetailFact: Identifiable {
    let systemImage: String
    let labelKey: String
    let value: String

    var id: String { "\(labelKey).\(value)" }

    init(_ systemImage: String, _ labelKey: String, _ value: String) {
        self.systemImage = systemImage
        self.labelKey = labelKey
        self.value = value
    }
}

private struct ModuleDetailError: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.title2)
                .foregroundStyle(Brand.evergreen)
            Text("common.error")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("common.retry", action: retry)
                .buttonStyle(.borderedProminent)
                .tint(Brand.evergreen)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(.background, in: RoundedRectangle(cornerRadius: 20))
        .accessibilityIdentifier("module.detail.error")
    }
}

private func formattedModuleDate(_ value: String?, includeTime: Bool = false) -> String? {
    guard let value else { return nil }
    let date = (try? Date(value, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
        ?? (try? Date(value, strategy: .iso8601))
    guard let date else { return nil }
    return date.formatted(date: .abbreviated, time: includeTime ? .shortened : .omitted)
}
