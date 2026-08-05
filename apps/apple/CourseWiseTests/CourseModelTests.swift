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

    @Test func moduleSummaryDecodesLearningPathMetadata() throws {
        let data = Data(
            """
            {
              "id": "00000000-0000-4000-8000-000000000201",
              "courseId": "00000000-0000-4000-8000-000000000101",
              "title": "Getting Started",
              "description": "Course orientation and learning objectives",
              "position": 0,
              "status": "published",
              "publishedAt": "2026-05-20T14:00:00.000Z",
              "startAt": "2026-06-01T00:00:00.000Z",
              "endAt": "2026-06-07T23:59:59.000Z",
              "closedAt": null,
              "counts": {
                "materials": 2,
                "presentations": 1,
                "assignments": 3,
                "quizzes": 1,
                "discussions": 2
              }
            }
            """.utf8
        )

        let module = try JSONDecoder().decode(ResourceSummary.self, from: data)

        #expect(module.title == "Getting Started")
        #expect(module.subtitle == "Course orientation and learning objectives")
        #expect(module.position == 0)
        #expect(module.status == "published")
        #expect(module.publishedAt == "2026-05-20T14:00:00.000Z")
        #expect(module.startAt == "2026-06-01T00:00:00.000Z")
        #expect(module.endAt == "2026-06-07T23:59:59.000Z")
        #expect(module.closedAt == nil)
        #expect(module.counts?.materials == 2)
        #expect(module.counts?.presentations == 1)
        #expect(module.counts?.assignments == 3)
        #expect(module.counts?.quizzes == 1)
        #expect(module.counts?.discussions == 2)
    }

    @Test func moduleContentSummaryDecodesAssessmentDetails() throws {
        let data = Data(
            """
            {
              "id": "00000000-0000-4000-8000-000000000331",
              "moduleId": "00000000-0000-4000-8000-000000000201",
              "title": "Orientation Check",
              "description": "Confirm the course structure.",
              "status": "published",
              "startTime": "2026-06-01T08:00:00.000Z",
              "endTime": "2026-06-07T23:59:00.000Z",
              "questionCount": 8,
              "timeLimitMinutes": 10,
              "maxAttempts": 2,
              "maxScore": 10,
              "passingScore": 7,
              "lockdown": false
            }
            """.utf8
        )

        let item = try JSONDecoder().decode(ModuleContentSummary.self, from: data)

        #expect(item.moduleID == "00000000-0000-4000-8000-000000000201")
        #expect(item.title == "Orientation Check")
        #expect(item.questionCount == 8)
        #expect(item.timeLimitMinutes == 10)
        #expect(item.maxAttempts == 2)
        #expect(item.maxScore == 10)
        #expect(item.passingScore == 7)
        #expect(item.lockdown == false)
    }
}
