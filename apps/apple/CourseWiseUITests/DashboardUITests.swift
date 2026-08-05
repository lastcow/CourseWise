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
        let modules = app.descendants(matching: .any)["course.feature.modules"]
        XCTAssertTrue(modules.waitForExistence(timeout: 3))
        modules.tap()

        XCTAssertTrue(app.navigationBars["Modules"].waitForExistence(timeout: 3))
        XCTAssertTrue(
            app.descendants(matching: .any)["resource.list.modules"].waitForExistence(timeout: 3)
        )
        XCTAssertTrue(app.staticTexts["Getting Started"].exists)
        XCTAssertTrue(app.staticTexts["Course orientation and learning objectives"].exists)
        XCTAssertTrue(app.staticTexts["Neural Network Foundations"].exists)
        XCTAssertTrue(app.staticTexts["Convolutional Networks"].exists)

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "modules-detailed-list"
        screenshot.lifetime = .keepAlways
        add(screenshot)
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
