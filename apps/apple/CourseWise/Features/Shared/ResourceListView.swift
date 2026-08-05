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
        VStack(alignment: .leading, spacing: 9) {
            Label("modules.schedule.session", systemImage: "calendar.badge.clock")
                .font(.caption2.weight(.semibold))
                .textCase(.uppercase)
                .tracking(0.7)
                .foregroundStyle(Brand.evergreen)

            HStack(alignment: .bottom, spacing: 8) {
                if let startDate {
                    ModuleSessionDate(
                        labelKey: "modules.schedule.starts",
                        value: startDate,
                        identifier: "module.schedule.start.\(moduleID)"
                    )
                }

                if startDate != nil, endDate != nil {
                    Image(systemName: "arrow.right")
                        .font(.caption2.bold())
                        .foregroundStyle(.tertiary)
                        .padding(.bottom, 4)
                        .accessibilityHidden(true)
                }

                if let endDate {
                    ModuleSessionDate(
                        labelKey: "modules.schedule.ends",
                        value: endDate,
                        identifier: "module.schedule.end.\(moduleID)"
                    )
                }
            }
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
        VStack(alignment: .leading, spacing: 2) {
            Text(labelKey)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Brand.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
        }
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
    @State private var errorMessage: String?

    private var teachingMaterials: [ModuleDetailEntry] {
        materials.map { ModuleDetailEntry(kind: .material, item: $0) }
            + presentations.map { ModuleDetailEntry(kind: .presentation, item: $0) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                ModuleDetailHero(course: course, module: module, sequence: sequence)

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
                        entries: teachingMaterials,
                        identifier: "module.detail.section.materials"
                    )
                    ModuleDetailSection(
                        titleKey: "modules.detail.assignments",
                        helpKey: "modules.detail.assignmentsHelp",
                        systemImage: "checklist",
                        entries: assignments.map { ModuleDetailEntry(kind: .assignment, item: $0) },
                        identifier: "module.detail.section.assignments"
                    )
                    ModuleDetailSection(
                        titleKey: "modules.detail.quizzes",
                        helpKey: "modules.detail.quizzesHelp",
                        systemImage: "questionmark.circle.fill",
                        entries: quizzes.map { ModuleDetailEntry(kind: .quiz, item: $0) },
                        identifier: "module.detail.section.quizzes"
                    )
                    ModuleDetailSection(
                        titleKey: "modules.detail.discussions",
                        helpKey: "modules.detail.discussionsHelp",
                        systemImage: "bubble.left.and.bubble.right.fill",
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
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .top, spacing: 14) {
                VStack(spacing: 2) {
                    Text("modules.dashboard.moduleNumber")
                        .font(.caption2.weight(.semibold))
                        .textCase(.uppercase)
                    Text(sequence, format: .number)
                        .font(.title2.bold())
                        .monospacedDigit()
                }
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(Brand.evergreen, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                VStack(alignment: .leading, spacing: 6) {
                    if let course {
                        Text("\(course.code) · \(course.title)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Brand.evergreen)
                            .lineLimit(1)
                    }
                    Text(module.title)
                        .font(.title2.bold())
                        .foregroundStyle(Brand.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if let subtitle = module.subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Spacer(minLength: 0)

                Label(statusKey, systemImage: statusSymbol)
                    .labelStyle(.iconOnly)
                    .font(.subheadline.bold())
                    .foregroundStyle(Brand.evergreen)
                    .frame(width: 34, height: 34)
                    .background(Brand.evergreen.opacity(0.11), in: Circle())
                    .accessibilityLabel(Text(statusKey))
            }

            let start = formattedModuleDate(module.startAt)
            let end = formattedModuleDate(module.endAt)
            if start != nil || end != nil {
                ModuleSessionSchedule(moduleID: "detail.\(module.id)", startDate: start, endDate: end)
            }
        }
        .padding(20)
        .background(.background, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .shadow(color: Brand.ink.opacity(0.06), radius: 14, y: 7)
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
    let entries: [ModuleDetailEntry]
    let identifier: String

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .center, spacing: 11) {
                Image(systemName: systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.evergreen)
                    .frame(width: 38, height: 38)
                    .background(Brand.evergreen.opacity(0.10), in: RoundedRectangle(cornerRadius: 12))

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
            if let opens = formattedModuleDate(item.startDate, includeTime: true) { values.append(.init("door.left.hand.open", "modules.detail.opens", opens)) }
            if let due = formattedModuleDate(item.dueDate, includeTime: true) { values.append(.init("calendar", "modules.detail.due", due)) }
            if let closes = formattedModuleDate(item.untilDate ?? item.endDate, includeTime: true) { values.append(.init("door.left.hand.closed", "modules.detail.closes", closes)) }
            if let points = item.maxScore { values.append(.init("star", "modules.detail.points", score(points))) }
            if let mode = item.submissionMode { values.append(.init("person", "modules.detail.submission", humanized(mode))) }
            if let late = item.allowLateSubmission { values.append(.init("clock.arrow.circlepath", "modules.detail.late", yesNo(late))) }
        case .quiz:
            if let opens = formattedModuleDate(item.startTime, includeTime: true) { values.append(.init("door.left.hand.open", "modules.detail.opens", opens)) }
            if let closes = formattedModuleDate(item.untilDate ?? item.endTime, includeTime: true) { values.append(.init("door.left.hand.closed", "modules.detail.closes", closes)) }
            if let questions = item.questionCount { values.append(.init("questionmark.circle", "modules.detail.questions", questions.formatted())) }
            if let minutes = item.timeLimitMinutes { values.append(.init("timer", "modules.detail.minutes", minutes.formatted())) }
            if let attempts = item.maxAttempts { values.append(.init("arrow.counterclockwise", "modules.detail.attempts", attempts.formatted())) }
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
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: entry.kind.systemImage)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Brand.evergreen)
                    .frame(width: 38, height: 38)
                    .background(Brand.evergreen.opacity(0.09), in: RoundedRectangle(cornerRadius: 12))

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

            if let preview = entry.kind == .material
                ? (entry.item.content ?? entry.item.description)
                : entry.item.description,
               !preview.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("modules.content.preview")
                        .font(.caption2.weight(.semibold))
                        .textCase(.uppercase)
                        .tracking(0.5)
                        .foregroundStyle(.secondary)
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(Brand.ink)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 13))
            }

            HStack {
                if let firstFact = facts.first {
                    Label(firstFact.value, systemImage: firstFact.systemImage)
                        .lineLimit(1)
                }
                Spacer()
                Text("modules.content.read")
                    .fontWeight(.semibold)
                    .foregroundStyle(Brand.evergreen)
                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Brand.ink.opacity(0.07))
        }
        .accessibilityElement(children: .contain)
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
}

private struct ModuleResourceDetailView: View {
    @Environment(AuthStore.self) private var authStore
    let entry: ModuleDetailEntry

    @State private var slides: [PresentationSlideSummary] = []
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
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: entry.kind.systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Brand.evergreen, in: RoundedRectangle(cornerRadius: 16))

            VStack(alignment: .leading, spacing: 5) {
                Text(entry.kind.labelKey)
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .tracking(0.6)
                    .foregroundStyle(Brand.evergreen)
                Text(entry.item.title)
                    .font(.title2.bold())
                    .foregroundStyle(Brand.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let description = entry.item.description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.background, in: RoundedRectangle(cornerRadius: 22))
        .overlay { RoundedRectangle(cornerRadius: 22).stroke(Brand.ink.opacity(0.07)) }
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
                    ContentTextPanel(text: entry.item.content ?? entry.item.description)
                case .assignment:
                    ContentTextPanel(text: entry.item.description)
                case .presentation:
                    if slides.isEmpty {
                        EmptyContentPanel()
                    } else {
                        ForEach(slides.sorted { $0.position < $1.position }) { slide in
                            PresentationSlideCard(slide: slide)
                        }
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
                    ContentTextPanel(text: entry.item.description)
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
        guard [.presentation, .quiz, .discussion].contains(entry.kind) else { return }
        isLoading = true
        defer { isLoading = false }

        do {
#if DEBUG
            if let fixture = UITestFixture.current {
                try await Task.sleep(for: .milliseconds(250))
                slides = fixture.presentationSlides[entry.item.id] ?? []
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
            case .quiz:
                questions = try await api.get("/api/quizzes/\(entry.item.id)/questions")
            case .discussion:
                discussionPage = try await api.get(
                    "/api/discussion-topics/\(entry.item.id)/posts?rootLimit=20"
                )
            case .material, .assignment:
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

private struct ContentTextPanel: View {
    let text: String?

    var body: some View {
        if let text, !text.isEmpty {
            Text(text)
                .font(.body)
                .foregroundStyle(Brand.ink)
                .lineSpacing(5)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(.background, in: RoundedRectangle(cornerRadius: 18))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(Brand.ink.opacity(0.07)) }
        } else {
            EmptyContentPanel()
        }
    }
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

private struct PresentationSlideCard: View {
    let slide: PresentationSlideSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(String(format: String(localized: "modules.content.slideNumberFormat"), slide.position + 1))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Brand.evergreen)
                Spacer()
                if let layout = slide.layout {
                    Text(layout.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            if let title = slide.title, !title.isEmpty {
                Text(title).font(.headline).foregroundStyle(Brand.ink)
            }
            if let content = slide.content, !content.isEmpty {
                Text(content).font(.body).lineSpacing(4).foregroundStyle(Brand.ink)
            }
            if let notes = slide.speakerNotes, !notes.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label("modules.content.speakerNotes", systemImage: "person.wave.2")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Brand.evergreen)
                    Text(notes).font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(10)
                .background(Brand.warmSurface, in: RoundedRectangle(cornerRadius: 11))
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Brand.ink.opacity(0.07)) }
        .accessibilityIdentifier("module.resource.slide.\(slide.id)")
    }
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
