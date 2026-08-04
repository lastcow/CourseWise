import SwiftUI

private struct StudentGradebook: Decodable, Sendable {
    let finalGrade: FinalGrade?
    let attendance: GradeCategory
    let assignments: GradeCategory
    let finalProject: GradeCategory
    let quizzes: GradeCategory
    let discussion: GradeCategory
}

private struct FinalGrade: Decodable, Sendable {
    let score: Double?
    let letterGrade: String?
}

private struct GradeCategory: Decodable, Sendable {
    let raw: Double?
    let weight: Double
    let weighted: Double
}

struct StudentGradesView: View {
    @Environment(AuthStore.self) private var authStore
    let course: CourseSummary
    @State private var gradebook: StudentGradebook?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("common.loading")
            } else if let gradebook {
                List {
                    Section("grades.final") {
                        LabeledContent("grades.score", value: percent(gradebook.finalGrade?.score))
                        LabeledContent("grades.letter", value: gradebook.finalGrade?.letterGrade ?? "—")
                    }
                    Section("grades.breakdown") {
                        category("nav.assignments", gradebook.assignments)
                        category("grades.finalProject", gradebook.finalProject)
                        category("nav.quizzes", gradebook.quizzes)
                        category("nav.attendance", gradebook.attendance)
                        category("nav.discussions", gradebook.discussion)
                    }
                }
                .refreshable { await load() }
            } else {
                ContentUnavailableView {
                    Label("common.error", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(errorMessage ?? String(localized: "common.empty"))
                } actions: {
                    Button("common.retry") { Task { await load() } }
                }
            }
        }
        .navigationTitle("nav.grades")
        .task { await load() }
        .privacySensitive()
    }

    private func category(_ title: LocalizedStringKey, _ category: GradeCategory) -> some View {
        LabeledContent(title, value: percent(category.raw))
    }

    private func percent(_ value: Double?) -> String {
        guard let value else { return "—" }
        return "\(value.formatted(.number.precision(.fractionLength(1))))%"
    }

    private func load() async {
        isLoading = true
        do {
            gradebook = try await authStore.authenticatedAPI().get(
                "/api/me/courses/\(course.id)/gradebook-detail"
            )
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
