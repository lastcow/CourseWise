import SwiftUI

enum FeatureDestination: String, CaseIterable, Identifiable, Hashable, Sendable {
    case courses
    case assignments
    case review
    case quizzes
    case materials
    case modules
    case announcements
    case messages
    case attendance
    case grades
    case discussions
    case students
    case groups
    case alerts
    case privacy
    case profile
    case settings

    var id: String { rawValue }

    var titleKey: LocalizedStringKey {
        switch self {
        case .courses: "nav.courses"
        case .assignments: "nav.assignments"
        case .review: "nav.review"
        case .quizzes: "nav.quizzes"
        case .materials: "nav.materials"
        case .modules: "nav.modules"
        case .announcements: "nav.announcements"
        case .messages: "nav.messages"
        case .attendance: "nav.attendance"
        case .grades: "nav.grades"
        case .discussions: "nav.discussions"
        case .students: "nav.students"
        case .groups: "nav.groups"
        case .alerts: "nav.alerts"
        case .privacy: "nav.privacy"
        case .profile: "nav.profile"
        case .settings: "nav.settings"
        }
    }

    var systemImage: String {
        switch self {
        case .courses: "books.vertical"
        case .assignments: "checklist"
        case .review: "tray.full"
        case .quizzes: "questionmark.circle"
        case .materials: "doc.richtext"
        case .modules: "square.grid.2x2"
        case .announcements: "megaphone"
        case .messages: "bubble.left.and.bubble.right"
        case .attendance: "checkmark.circle"
        case .grades: "chart.bar.doc.horizontal"
        case .discussions: "text.bubble"
        case .students: "person.3"
        case .groups: "person.3.sequence"
        case .alerts: "exclamationmark.triangle"
        case .privacy: "hand.raised"
        case .profile: "person.crop.circle"
        case .settings: "gearshape"
        }
    }

    var dashboardDescriptionKey: LocalizedStringKey {
        switch self {
        case .courses: "dashboard.component.courses.description"
        case .assignments: "dashboard.component.assignments.description"
        case .review: "dashboard.component.review.description"
        case .quizzes: "dashboard.component.quizzes.description"
        case .materials: "dashboard.component.materials.description"
        case .modules: "dashboard.component.modules.description"
        case .announcements: "dashboard.component.announcements.description"
        case .messages: "dashboard.component.messages.description"
        case .attendance: "dashboard.component.attendance.description"
        case .grades: "dashboard.component.grades.description"
        case .discussions: "dashboard.component.discussions.description"
        case .students: "dashboard.component.students.description"
        case .groups: "dashboard.component.groups.description"
        case .alerts: "dashboard.component.alerts.description"
        case .privacy: "dashboard.component.privacy.description"
        case .profile: "dashboard.component.profile.description"
        case .settings: "dashboard.component.settings.description"
        }
    }

    var dashboardCapabilityKeys: [LocalizedStringKey] {
        switch self {
        case .courses:
            ["dashboard.component.courses.capability1", "dashboard.component.courses.capability2"]
        case .assignments:
            ["dashboard.component.assignments.capability1", "dashboard.component.assignments.capability2"]
        case .review:
            ["dashboard.component.review.capability1", "dashboard.component.review.capability2"]
        case .quizzes:
            ["dashboard.component.quizzes.capability1", "dashboard.component.quizzes.capability2"]
        case .materials:
            ["dashboard.component.materials.capability1", "dashboard.component.materials.capability2"]
        case .modules:
            ["dashboard.component.modules.capability1", "dashboard.component.modules.capability2"]
        case .announcements:
            ["dashboard.component.announcements.capability1", "dashboard.component.announcements.capability2"]
        case .messages:
            ["dashboard.component.messages.capability1", "dashboard.component.messages.capability2"]
        case .attendance:
            ["dashboard.component.attendance.capability1", "dashboard.component.attendance.capability2"]
        case .grades:
            ["dashboard.component.grades.capability1", "dashboard.component.grades.capability2"]
        case .discussions:
            ["dashboard.component.discussions.capability1", "dashboard.component.discussions.capability2"]
        case .students:
            ["dashboard.component.students.capability1", "dashboard.component.students.capability2"]
        case .groups:
            ["dashboard.component.groups.capability1", "dashboard.component.groups.capability2"]
        case .alerts:
            ["dashboard.component.alerts.capability1", "dashboard.component.alerts.capability2"]
        case .privacy:
            ["dashboard.component.privacy.capability1", "dashboard.component.privacy.capability2"]
        case .profile:
            ["dashboard.component.profile.capability1", "dashboard.component.profile.capability2"]
        case .settings:
            ["dashboard.component.settings.capability1", "dashboard.component.settings.capability2"]
        }
    }

    var isCourseScoped: Bool {
        switch self {
        case .alerts, .privacy, .profile, .settings:
            false
        default:
            true
        }
    }

    static func dashboardItems(for role: UserRole) -> [FeatureDestination] {
        switch role {
        case .student:
            [.courses, .assignments, .quizzes, .announcements, .messages, .grades, .attendance, .discussions, .groups]
        case .teacher:
            [.courses, .review, .attendance, .announcements, .messages, .students, .alerts, .materials, .quizzes]
        case .admin:
            [.courses, .alerts, .students, .messages, .privacy, .settings]
        }
    }

    static func sidebarItems(for role: UserRole) -> [FeatureDestination] {
        dashboardItems(for: role) + [.profile, .settings]
    }
}
