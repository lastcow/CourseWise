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
        } else if destination == .modules {
            ModulesDashboardView(modules: resources, course: course)
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
            let collection: ResourceCollection = try await authStore.authenticatedAPI().get(path)
            resources = collection.items
            errorMessage = nil
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ModulesDashboardView: View {
    let modules: [ResourceSummary]
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
                        ModuleTimelineRow(module: module, sequence: index + 1)
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
