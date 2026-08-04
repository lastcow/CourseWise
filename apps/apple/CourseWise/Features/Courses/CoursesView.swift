import SwiftUI

struct CoursesView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var courses: [CourseSummary] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

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
                ContentUnavailableView("common.empty", systemImage: "books.vertical")
            } else {
                List(courses) { course in
                    NavigationLink {
                        CourseHubView(course: course)
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(course.title).font(.headline)
                            HStack {
                                Text(course.code)
                                if let term = course.term { Text("• \(term)") }
                            }
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                    .accessibilityIdentifier("courses.row.\(course.id.uuidString)")
                }
                .accessibilityIdentifier("courses.list")
                .refreshable { await load() }
            }
        }
        .navigationTitle("nav.courses")
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
