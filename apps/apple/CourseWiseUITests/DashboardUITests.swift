import XCTest

@MainActor
final class DashboardUITests: XCTestCase {
    func testEveryAdminComponentOpensItsDetailPage() throws {
        continueAfterFailure = false
        let app = launch(language: "en")

        let dashboard = app.descendants(matching: .any)["dashboard.screen"]
        XCTAssertTrue(dashboard.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Hello, Admin"].exists)
        XCTAssertTrue(app.staticTexts["4"].exists)

        for component in ["courses", "alerts", "students", "messages", "privacy", "settings"] {
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

        let openComponent = app.descendants(matching: .any)["dashboard.detail.open"]
        XCTAssertTrue(openComponent.waitForExistence(timeout: 3))
        for _ in 0..<6 where !openComponent.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(openComponent.isHittable)
        openComponent.tap()

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
