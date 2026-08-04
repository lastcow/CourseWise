import SwiftUI

struct CourseFeaturePickerView: View {
    @Environment(AuthStore.self) private var authStore
    let destination: FeatureDestination
    @State private var courses: [CourseSummary] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("common.loading")
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("common.error", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("common.retry") { Task { await load() } }
                }
            } else if courses.isEmpty {
                ContentUnavailableView("common.empty", systemImage: "books.vertical")
            } else {
                List(courses) { course in
                    NavigationLink {
                        CourseDestinationView(destination: destination, course: course)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(course.title).font(.headline)
                            Text(course.code).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                .refreshable { await load() }
            }
        }
        .navigationTitle(destination.titleKey)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        do {
            courses = try await authStore.authenticatedAPI().get("/api/courses")
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct CourseDestinationView: View {
    @Environment(AuthStore.self) private var authStore
    let destination: FeatureDestination
    let course: CourseSummary

    var body: some View {
        if destination == .grades, authStore.account?.role == .student {
            StudentGradesView(course: course)
        } else {
            ResourceListView(destination: destination, courseID: course.id)
        }
    }
}
