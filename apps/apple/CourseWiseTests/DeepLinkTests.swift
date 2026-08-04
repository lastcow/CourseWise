import Foundation
import Testing
@testable import CourseWise

struct DeepLinkTests {
    @Test func invitationLink() throws {
        let link = try #require(URL(string: "https://fsuac.com/invite/COURSE123"))
        #expect(DeepLink(url: link).destination == .invitation("COURSE123"))
    }

    @Test func passwordResetLink() throws {
        let link = try #require(URL(string: "https://fsuac.com/reset-password?token=abc"))
        #expect(DeepLink(url: link).destination == .resetPassword("abc"))
    }

    @Test func courseNotificationLink() throws {
        let id = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
        let link = try #require(
            URL(string: "https://fsuac.com/student/courses/\(id)/announcements")
        )
        #expect(DeepLink(url: link).destination == .course(id, .announcements))
    }
}
