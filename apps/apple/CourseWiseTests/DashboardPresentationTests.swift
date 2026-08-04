import Testing
@testable import CourseWise

struct DashboardPresentationTests {
    @Test func studentWorkspaceIsRoleSpecific() {
        #expect(FeatureDestination.dashboardItems(for: .student) == [
            .courses, .assignments, .quizzes, .announcements, .messages,
            .grades, .attendance, .discussions, .groups,
        ])
    }

    @Test func teacherWorkspaceIsRoleSpecific() {
        #expect(FeatureDestination.dashboardItems(for: .teacher) == [
            .courses, .review, .attendance, .announcements, .messages,
            .students, .alerts, .materials, .quizzes,
        ])
    }

    @Test func adminWorkspaceIsRoleSpecific() {
        #expect(FeatureDestination.dashboardItems(for: .admin) == [
            .courses, .alerts, .students, .messages, .privacy, .settings,
        ])
    }

    @Test func accountScopedComponentsDoNotClaimCourseCoverage() {
        let accountScoped = FeatureDestination.allCases.filter { !$0.isCourseScoped }
        #expect(accountScoped == [.alerts, .privacy, .profile, .settings])
    }
}
