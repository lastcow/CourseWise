import Foundation
import Testing
@testable import CourseWise

struct CourseModelTests {
    @Test func courseSummaryDecodesCatalogMetadata() throws {
        let data = Data(
            """
            {
              "id": "00000000-0000-4000-8000-000000000101",
              "code": "DL2026",
              "title": "Deep Learning",
              "description": "Build modern AI systems.",
              "status": "active",
              "termLabel": "Summer 2026",
              "startDate": "2026-06-01T00:00:00.000Z",
              "endDate": "2026-08-21T00:00:00.000Z",
              "bannerUrl": "https://cdn.example.com/courses/dl2026.jpg",
              "lmsProvider": "canvas",
              "counts": {
                "modules": 8,
                "assignments": 12,
                "presentations": 6,
                "students": 32
              }
            }
            """.utf8
        )

        let course = try JSONDecoder().decode(CourseSummary.self, from: data)

        #expect(course.term == "Summer 2026")
        #expect(course.bannerURLString == "https://cdn.example.com/courses/dl2026.jpg")
        #expect(course.description == "Build modern AI systems.")
        #expect(course.lmsProvider == "canvas")
        #expect(course.counts.modules == 8)
        #expect(course.counts.assignments == 12)
        #expect(course.counts.presentations == 6)
        #expect(course.counts.students == 32)
    }
}
