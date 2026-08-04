import Foundation

struct CourseSummary: Codable, Hashable, Identifiable, Sendable {
    let id: UUID
    let code: String
    let title: String
    let status: String
    let term: String?
    let startDate: String?
    let endDate: String?
}

struct ResourceSummary: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String?
    let status: String?

    init(id: String, title: String, subtitle: String?, status: String?) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.status = status
    }

    private struct DynamicKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicKey.self)
        func string(_ names: [String]) -> String? {
            for name in names {
                guard let key = DynamicKey(stringValue: name) else { continue }
                if let value = try? container.decode(String.self, forKey: key) {
                    return value
                }
            }
            return nil
        }

        id = string(["id", "threadId", "assignmentId", "quizId", "materialId", "moduleId"])
            ?? UUID().uuidString
        title = string(["title", "name", "subject", "studentName", "quizTitle", "code"])
            ?? String(localized: "common.empty")
        subtitle = string(["description", "body", "code", "status", "studentEmail", "email"])
        status = string(["status"])
    }
}

struct ResourceCollection: Decodable, Sendable {
    let items: [ResourceSummary]

    private enum CodingKeys: String, CodingKey {
        case threads
        case items
        case results
        case devices
    }

    init(from decoder: Decoder) throws {
        if let array = try? decoder.singleValueContainer().decode([ResourceSummary].self) {
            items = array
            return
        }
        let container = try decoder.container(keyedBy: CodingKeys.self)
        for key in [CodingKeys.threads, .items, .results, .devices] {
            if let value = try container.decodeIfPresent([ResourceSummary].self, forKey: key) {
                items = value
                return
            }
        }
        items = []
    }
}
