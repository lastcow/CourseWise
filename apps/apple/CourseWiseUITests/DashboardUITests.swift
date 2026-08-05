import XCTest

@MainActor
final class DashboardUITests: XCTestCase {
    func testAdminDashboardRoutesCoursesDirectlyAndOtherComponentsToDetails() throws {
        continueAfterFailure = false
        let app = launch(language: "en")

        let dashboard = app.descendants(matching: .any)["dashboard.screen"]
        XCTAssertTrue(dashboard.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Hello, Admin"].exists)
        XCTAssertTrue(app.staticTexts["4"].exists)

        let courses = app.descendants(matching: .any)["dashboard.component.courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 3))
        courses.tap()

        XCTAssertTrue(app.descendants(matching: .any)["courses.list"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["courses.summary"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["courses.filter"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["dashboard.detail.courses"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["dashboard.detail.open"].exists)
        XCTAssertTrue(app.staticTexts["Build modern AI systems from neural network foundations to production workflows."].exists)
        let deepLearningID = "00000000-0000-4000-8000-000000000101"
        let statusIndicator = app.descendants(matching: .any)["courses.card.\(deepLearningID).status"]
        XCTAssertTrue(statusIndicator.exists)
        XCTAssertEqual(statusIndicator.label, "Active")
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "courses.metric.00000000-0000-4000-8000-000000000101.modules"
            ].exists
        )

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "courses-professional-catalog"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        for (id, title) in [
            ("00000000-0000-4000-8000-000000000101", "Deep Learning"),
            ("00000000-0000-4000-8000-000000000102", "Software Engineering Economics"),
            ("00000000-0000-4000-8000-000000000103", "Introduction to Management"),
            ("00000000-0000-4000-8000-000000000104", "Product Design Systems"),
        ] {
            let row = app.descendants(matching: .any)["courses.row.\(id)"]
            for _ in 0..<5 where !row.exists {
                app.swipeUp()
            }
            XCTAssertTrue(row.exists, "Missing eligible course: \(title)")
            if id == "00000000-0000-4000-8000-000000000102" {
                let canvasIndicator = app.descendants(matching: .any)["courses.card.\(id).canvas"]
                XCTAssertTrue(canvasIndicator.exists)
                XCTAssertEqual(canvasIndicator.label, "Canvas")
            }
        }

        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(dashboard.waitForExistence(timeout: 3))

        for component in ["alerts", "students", "messages", "privacy", "settings"] {
            let link = app.descendants(matching: .any)["dashboard.component.\(component)"]
            XCTAssertTrue(link.waitForExistence(timeout: 3), "Missing dashboard component: \(component)")
            link.tap()

            let detail = app.descendants(matching: .any)["dashboard.detail.\(component)"]
            XCTAssertTrue(detail.waitForExistence(timeout: 3), "Missing detail page: \(component)")
            XCTAssertTrue(app.descendants(matching: .any)["dashboard.detail.open"].exists)

            app.navigationBars.buttons.firstMatch.tap()
            XCTAssertTrue(dashboard.waitForExistence(timeout: 3))
        }
    }

    func testCoursesSearchFiltersTheCatalog() throws {
        continueAfterFailure = false
        let app = launch(language: "en")

        let courses = app.descendants(matching: .any)["dashboard.component.courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 5))
        courses.tap()

        XCTAssertTrue(app.descendants(matching: .any)["courses.list"].waitForExistence(timeout: 3))
        let search = app.searchFields["Search courses"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("Economics")

        XCTAssertTrue(app.staticTexts["Software Engineering Economics"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["Deep Learning"].exists)
    }

    func testSimplifiedChineseDashboard() throws {
        continueAfterFailure = false
        let app = launch(language: "zh-Hans")

        XCTAssertTrue(app.navigationBars["仪表盘"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["工作区"].exists)
        XCTAssertTrue(app.staticTexts["可见课程"].exists)
        XCTAssertTrue(app.staticTexts["账号状态"].exists)

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "dashboard-zh-Hans"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testDashboardAdaptsToLandscape() throws {
        continueAfterFailure = false
        let app = launch(language: "en", orientation: .landscapeLeft)

        XCTAssertTrue(app.descendants(matching: .any)["dashboard.screen"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["dashboard.component.courses"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["dashboard.component.alerts"].exists)
    }

    func testSimplifiedChineseCourseDashboardShowsAllSections() throws {
        continueAfterFailure = false
        let app = launch(language: "zh-Hans")

        let courses = app.descendants(matching: .any)["dashboard.component.courses"]
        XCTAssertTrue(courses.waitForExistence(timeout: 5))
        courses.tap()

        XCTAssertTrue(app.descendants(matching: .any)["courses.list"].waitForExistence(timeout: 3))
        let deepLearning = app.descendants(matching: .any)[
            "courses.row.00000000-0000-4000-8000-000000000101"
        ]
        XCTAssertTrue(deepLearning.waitForExistence(timeout: 3))
        deepLearning.tap()

        XCTAssertTrue(app.descendants(matching: .any)["course.hub"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["课程概览"].exists)
        XCTAssertTrue(app.staticTexts["课程统计"].exists)
        XCTAssertTrue(app.staticTexts["学习与测评"].exists)

        let information = app.descendants(matching: .any)["course.hub.information"]
        for _ in 0..<12 where !information.exists {
            app.swipeUp()
        }
        XCTAssertTrue(app.staticTexts["沟通与管理"].exists)
        XCTAssertTrue(information.exists)
        XCTAssertTrue(app.staticTexts["课程信息"].exists)

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "course-dashboard-zh-Hans-information"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testModulesDetailedList() throws {
        continueAfterFailure = false
        let app = launch(language: "en")

        let coursesComponent = app.descendants(matching: .any)["dashboard.component.courses"]
        XCTAssertTrue(coursesComponent.waitForExistence(timeout: 5))
        coursesComponent.tap()

        XCTAssertTrue(app.descendants(matching: .any)["courses.list"].waitForExistence(timeout: 3))
        let deepLearning = app.descendants(matching: .any)[
            "courses.row.00000000-0000-4000-8000-000000000101"
        ]
        XCTAssertTrue(deepLearning.waitForExistence(timeout: 3))
        deepLearning.tap()

        XCTAssertTrue(app.descendants(matching: .any)["course.hub"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["course.hub.hero"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["course.hub.metrics"].exists)
        XCTAssertTrue(app.staticTexts["COURSE OVERVIEW"].exists)
        XCTAssertTrue(app.staticTexts["Course statistics"].exists)
        XCTAssertTrue(app.staticTexts["Deep Learning"].exists)
        XCTAssertTrue(app.staticTexts["Summer 2026"].exists)
        XCTAssertTrue(app.staticTexts["Learn & assess"].exists)

        let courseDashboardScreenshot = XCTAttachment(screenshot: app.screenshot())
        courseDashboardScreenshot.name = "course-dashboard-professional"
        courseDashboardScreenshot.lifetime = .keepAlways
        add(courseDashboardScreenshot)

        let modules = app.descendants(matching: .any)["course.feature.modules"]
        for _ in 0..<5 where !modules.exists {
            app.swipeUp()
        }
        XCTAssertTrue(modules.waitForExistence(timeout: 3))
        modules.tap()

        XCTAssertTrue(app.navigationBars["Modules"].waitForExistence(timeout: 3))
        XCTAssertTrue(
            app.descendants(matching: .any)["resource.list.modules"].waitForExistence(timeout: 3)
        )
        XCTAssertTrue(app.descendants(matching: .any)["modules.dashboard"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["modules.summary"].exists)
        XCTAssertTrue(app.staticTexts["Module roadmap"].exists)
        XCTAssertTrue(app.staticTexts["Learning sequence"].exists)
        XCTAssertTrue(app.staticTexts["Getting Started"].exists)
        XCTAssertTrue(app.staticTexts["Course orientation and learning objectives"].exists)
        XCTAssertTrue(app.staticTexts["Neural Network Foundations"].exists)
        XCTAssertTrue(app.staticTexts["Convolutional Networks"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "module.schedule.00000000-0000-4000-8000-000000000201"
            ].exists
        )
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "module.schedule.start.00000000-0000-4000-8000-000000000201"
            ].exists
        )
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "module.schedule.end.00000000-0000-4000-8000-000000000201"
            ].exists
        )
        let listStart = app.descendants(matching: .any)[
            "module.schedule.start.00000000-0000-4000-8000-000000000201"
        ]
        let listEnd = app.descendants(matching: .any)[
            "module.schedule.end.00000000-0000-4000-8000-000000000201"
        ]
        XCTAssertLessThan(listStart.frame.midY, listEnd.frame.midY)
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "module.statistics.00000000-0000-4000-8000-000000000201"
            ].exists
        )
        XCTAssertEqual(
            app.descendants(matching: .any)[
                "module.statistics.00000000-0000-4000-8000-000000000201.materials"
            ].value as? String,
            "3"
        )
        XCTAssertEqual(
            app.descendants(matching: .any)[
                "module.statistics.00000000-0000-4000-8000-000000000201.assignments"
            ].value as? String,
            "1"
        )

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "modules-detailed-list"
        screenshot.lifetime = .keepAlways
        add(screenshot)

        let firstModule = app.descendants(matching: .any)[
            "module.link.00000000-0000-4000-8000-000000000201"
        ]
        XCTAssertTrue(firstModule.waitForExistence(timeout: 3))
        firstModule.tap()

        XCTAssertTrue(app.navigationBars["Module details"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["module.detail"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["module.detail.hero"].exists)
        XCTAssertTrue(app.staticTexts["Getting Started"].exists)
        XCTAssertTrue(app.staticTexts["Course Guide"].waitForExistence(timeout: 5))
        XCTAssertEqual(
            app.descendants(matching: .any)[
                "module.statistics.detail.00000000-0000-4000-8000-000000000201.materials"
            ].value as? String,
            "3"
        )
        XCTAssertEqual(
            app.descendants(matching: .any)[
                "module.statistics.detail.00000000-0000-4000-8000-000000000201.assignments"
            ].value as? String,
            "1"
        )
        let detailStart = app.descendants(matching: .any)[
            "module.schedule.start.detail.00000000-0000-4000-8000-000000000201"
        ]
        let detailEnd = app.descendants(matching: .any)[
            "module.schedule.end.detail.00000000-0000-4000-8000-000000000201"
        ]
        XCTAssertLessThan(detailStart.frame.midY, detailEnd.frame.midY)
        XCTAssertFalse(app.staticTexts["CONTENT PREVIEW"].exists)
        XCTAssertFalse(app.staticTexts["OVERVIEW"].exists)
        XCTAssertTrue(app.staticTexts["Learning Objectives"].exists)
        XCTAssertTrue(app.staticTexts["Orientation Deck"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["module.detail.section.materials"].exists
        )

        let overviewScreenshot = XCTAttachment(screenshot: app.screenshot())
        overviewScreenshot.name = "module-detail-professional-overview"
        overviewScreenshot.lifetime = .keepAlways
        add(overviewScreenshot)

        let courseGuide = app.descendants(matching: .any)[
            "module.detail.material.00000000-0000-4000-8000-000000000301"
        ]
        XCTAssertTrue(courseGuide.waitForExistence(timeout: 3))
        courseGuide.tap()
        XCTAssertTrue(app.descendants(matching: .any)["module.resource.detail"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["module.resource.content"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "This guide explains how each week is organized")
            ).firstMatch.exists
        )

        let materialScreenshot = XCTAttachment(screenshot: app.screenshot())
        materialScreenshot.name = "module-material-full-content"
        materialScreenshot.lifetime = .keepAlways
        add(materialScreenshot)
        app.navigationBars.buttons.element(boundBy: 0).tap()

        let orientationDeck = app.descendants(matching: .any)[
            "module.detail.presentation.00000000-0000-4000-8000-000000000311"
        ]
        for _ in 0..<4 where !orientationDeck.exists { app.swipeUp() }
        XCTAssertTrue(orientationDeck.waitForExistence(timeout: 3))
        orientationDeck.tap()
        XCTAssertTrue(app.staticTexts["Welcome to Deep Learning"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["How each week works"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "module.resource.slide.00000000-0000-4000-8000-000000000411"
            ].exists
        )
        app.navigationBars.buttons.element(boundBy: 0).tap()

        let discussionSection = app.descendants(matching: .any)["module.detail.section.discussions"]
        for _ in 0..<10 where !discussionSection.exists {
            app.swipeUp()
        }
        XCTAssertTrue(discussionSection.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Learning Goals Reflection"].exists)
        XCTAssertTrue(app.staticTexts["Orientation Check"].exists)
        XCTAssertTrue(app.staticTexts["Introduce Yourself"].exists)
        let assignmentCard = app.descendants(matching: .any)[
            "module.detail.assignment.00000000-0000-4000-8000-000000000321"
        ]
        let quizCard = app.descendants(matching: .any)[
            "module.detail.quiz.00000000-0000-4000-8000-000000000331"
        ]
        let discussionCard = app.descendants(matching: .any)[
            "module.detail.discussion.00000000-0000-4000-8000-000000000341"
        ]
        XCTAssertTrue(assignmentCard.exists)
        XCTAssertTrue(quizCard.exists)
        XCTAssertTrue(discussionCard.exists)
        let assignmentValue = assignmentCard.value as? String ?? ""
        XCTAssertTrue(assignmentValue.contains("Submissions: 28"))
        XCTAssertTrue(assignmentValue.contains("Graded: 22"))
        XCTAssertTrue(assignmentValue.contains("Needs grading: 6"))
        let quizValue = quizCard.value as? String ?? ""
        XCTAssertTrue(quizValue.contains("Attempts: 30"))
        XCTAssertTrue(quizValue.contains("Needs review: 4"))
        XCTAssertTrue((discussionCard.value as? String ?? "").contains("Posts: 24"))

        let assessmentCardsScreenshot = XCTAttachment(screenshot: app.screenshot())
        assessmentCardsScreenshot.name = "module-assessment-cards"
        assessmentCardsScreenshot.lifetime = .keepAlways
        add(assessmentCardsScreenshot)

        let orientationQuiz = app.descendants(matching: .any)[
            "module.detail.quiz.00000000-0000-4000-8000-000000000331"
        ]
        orientationQuiz.tap()
        XCTAssertTrue(
            app.staticTexts["Where can you find the required learning materials for each week?"]
                .waitForExistence(timeout: 4)
        )
        XCTAssertTrue(app.staticTexts["Inside the corresponding module"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "module.resource.question.00000000-0000-4000-8000-000000000421"
            ].exists
        )

        let quizScreenshot = XCTAttachment(screenshot: app.screenshot())
        quizScreenshot.name = "module-quiz-question-content"
        quizScreenshot.lifetime = .keepAlways
        add(quizScreenshot)
        app.navigationBars.buttons.element(boundBy: 0).tap()

        let introduction = app.descendants(matching: .any)[
            "module.detail.discussion.00000000-0000-4000-8000-000000000341"
        ]
        for _ in 0..<4 where !introduction.exists { app.swipeUp() }
        XCTAssertTrue(introduction.waitForExistence(timeout: 3))
        introduction.tap()
        XCTAssertTrue(app.staticTexts["Alex Morgan"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.staticTexts["Dr. Chen"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "building reliable computer-vision tools")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "module.resource.post.00000000-0000-4000-8000-000000000431"
            ].exists
        )

        let assessmentScreenshot = XCTAttachment(screenshot: app.screenshot())
        assessmentScreenshot.name = "module-discussion-content"
        assessmentScreenshot.lifetime = .keepAlways
        add(assessmentScreenshot)
    }

    private func launch(
        language: String,
        orientation: UIDeviceOrientation = .portrait
    ) -> XCUIApplication {
        XCUIDevice.shared.orientation = orientation
        let app = XCUIApplication()
        app.launchEnvironment["COURSEWISE_UI_TESTING"] = "1"
        app.launchEnvironment["COURSEWISE_UI_TEST_ROLE"] = "admin"
        app.launchArguments += ["-ApplePersistenceIgnoreState", "YES"]
        app.launchArguments += ["-AppleLanguages", "(\(language))"]
        app.launch()
        return app
    }
}
