#if DEBUG
import Foundation

struct UITestFixture: Sendable {
    let account: Account
    let courses: [CourseSummary]

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
                    startDate: nil,
                    endDate: nil
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000102")!,
                    code: "SEE-2026",
                    title: "Software Engineering Economics",
                    status: "active",
                    term: "Summer 2026",
                    startDate: nil,
                    endDate: nil
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000103")!,
                    code: "MGMT101",
                    title: "Introduction to Management",
                    status: "active",
                    term: "Fall 2026",
                    startDate: nil,
                    endDate: nil
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000104")!,
                    code: "DES210",
                    title: "Product Design Systems",
                    status: "active",
                    term: "Fall 2026",
                    startDate: nil,
                    endDate: nil
                ),
            ]
        )
    }
}
#endif
