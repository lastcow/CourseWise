import SwiftUI

struct ResourceListView: View {
    @Environment(AuthStore.self) private var authStore
    let destination: FeatureDestination
    var courseID: UUID?

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
