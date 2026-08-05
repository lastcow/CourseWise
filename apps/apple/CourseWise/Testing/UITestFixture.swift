#if DEBUG
import Foundation

struct UITestFixture: Sendable {
    let account: Account
    let courses: [CourseSummary]
    let modules: [ResourceSummary]

    static var current: UITestFixture? {
        let environment = ProcessInfo.processInfo.environment
        guard environment["COURSEWISE_UI_TESTING"] == "1" else { return nil }

        let role = UserRole(rawValue: environment["COURSEWISE_UI_TEST_ROLE"] ?? "admin") ?? .admin
        let name: String
        switch role {
        case .student: name = "Student"
        case .teacher: name = "Teacher"
        case .admin: name = "Admin"
        }

        return UITestFixture(
            account: Account(
                id: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
                email: "ui-tests@coursewise.app",
                name: name,
                role: role,
                status: .active,
                preferredLanguage: nil
            ),
            courses: [
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000101")!,
                    code: "DL2026",
                    title: "Deep Learning",
                    status: "active",
                    term: "Summer 2026",
                    startDate: "2026-06-01T00:00:00.000Z",
                    endDate: "2026-08-21T00:00:00.000Z",
                    description: "Build modern AI systems from neural network foundations to production workflows.",
                    counts: CourseCounts(modules: 8, assignments: 12, presentations: 6, students: 32)
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000102")!,
                    code: "SEE-2026",
                    title: "Software Engineering Economics",
                    status: "active",
                    term: "Summer 2026",
                    startDate: "2026-06-01T00:00:00.000Z",
                    endDate: "2026-08-21T00:00:00.000Z",
                    description: "Evaluate engineering decisions through cost, risk, value, and delivery strategy.",
                    lmsProvider: "canvas",
                    counts: CourseCounts(modules: 10, assignments: 9, presentations: 4, students: 28)
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000103")!,
                    code: "MGMT101",
                    title: "Introduction to Management",
                    status: "draft",
                    term: "Fall 2026",
                    startDate: "2026-09-01T00:00:00.000Z",
                    endDate: "2026-12-15T00:00:00.000Z",
                    description: "Explore organizational leadership, decision-making, teams, and operations.",
                    counts: CourseCounts(modules: 6, assignments: 7, presentations: 3, students: 24)
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000104")!,
                    code: "DES210",
                    title: "Product Design Systems",
                    status: "archived",
                    term: "Spring 2026",
                    startDate: "2026-01-20T00:00:00.000Z",
                    endDate: "2026-05-08T00:00:00.000Z",
                    description: "Create scalable interface foundations across design and engineering teams.",
                    counts: CourseCounts(modules: 7, assignments: 8, presentations: 5, students: 26)
                ),
            ],
            modules: [
                ResourceSummary(
                    id: "00000000-0000-4000-8000-000000000201",
                    title: "Getting Started",
                    subtitle: "Course orientation and learning objectives",
                    status: "published"
                ),
                ResourceSummary(
                    id: "00000000-0000-4000-8000-000000000202",
                    title: "Neural Network Foundations",
                    subtitle: "Core architectures, activation functions, and optimization",
                    status: "published"
                ),
                ResourceSummary(
                    id: "00000000-0000-4000-8000-000000000203",
                    title: "Convolutional Networks",
                    subtitle: "Image classification, feature maps, and practical labs",
                    status: "draft"
                ),
            ]
        )
    }
}
#endif
