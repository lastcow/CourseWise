import SwiftUI

struct FeatureDestinationView: View {
    let destination: FeatureDestination

    var body: some View {
        switch destination {
        case .courses:
            CoursesView()
        case .assignments, .review, .quizzes, .materials, .modules, .announcements, .messages,
             .attendance, .grades, .discussions, .students, .groups:
            CourseFeaturePickerView(destination: destination)
        case .alerts:
            ResourceListView(destination: destination)
        case .settings:
            SettingsView()
        case .profile:
            ProfileView()
        case .privacy:
            PrivacyDataView()
        }
    }
}
