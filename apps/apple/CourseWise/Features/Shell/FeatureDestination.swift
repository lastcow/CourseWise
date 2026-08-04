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
        LocalizedStringKey("nav.\(rawValue)")
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
        case .attendance: "person.2.badge.checkmark"
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
