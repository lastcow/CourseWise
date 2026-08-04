import Foundation

struct DeepLink: Hashable, Sendable {
    enum Destination: Hashable, Sendable {
        case invitation(String)
        case resetPassword(String)
        case export(String)
        case presentation(String)
        case course(UUID, FeatureDestination?)
        case unknown
    }

    let destination: Destination

    init(url: URL) {
        let components = url.pathComponents.filter { $0 != "/" }
        if components.first == "invite", let code = components.dropFirst().first {
            destination = .invitation(code)
        } else if components.first == "reset-password",
                  let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "token" })?.value {
            destination = .resetPassword(token)
        } else if components.prefix(2) == ["share", "export"], let token = components.last {
            destination = .export(token)
        } else if components.first == "p", let token = components.last {
            destination = .presentation(token)
        } else if components.count >= 3,
                  (components[0] == "student" || components[0] == "teacher"),
                  components[1] == "courses",
                  let courseID = UUID(uuidString: components[2]) {
            let feature = components.count > 3 ? FeatureDestination(rawValue: components[3]) : nil
            destination = .course(courseID, feature)
        } else {
            destination = .unknown
        }
    }
}
