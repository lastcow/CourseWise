import Foundation

struct AppConfiguration: Sendable {
    let apiBaseURL: URL
    let webBaseURL: URL

    static let current: AppConfiguration = {
        let environment = ProcessInfo.processInfo.environment
        let api = environment["COURSEWISE_API_URL"] ?? "https://api.fsuac.com"
        let web = environment["COURSEWISE_WEB_URL"] ?? "https://fsuac.com"

        guard let apiURL = URL(string: api), let webURL = URL(string: web) else {
            preconditionFailure("COURSEWISE_API_URL and COURSEWISE_WEB_URL must be valid URLs")
        }
        return AppConfiguration(apiBaseURL: apiURL, webBaseURL: webURL)
    }()
}
