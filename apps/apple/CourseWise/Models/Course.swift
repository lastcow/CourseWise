import Foundation

struct CourseCounts: Codable, Hashable, Sendable {
    let modules: Int
    let assignments: Int
    let presentations: Int
    let students: Int

    static let zero = CourseCounts(modules: 0, assignments: 0, presentations: 0, students: 0)
}

struct CourseSummary: Codable, Hashable, Identifiable, Sendable {
    let id: UUID
    let code: String
    let title: String
    let description: String?
    let status: String
    let term: String?
    let startDate: String?
    let endDate: String?
    let bannerURLString: String?
    let lmsProvider: String?
    let counts: CourseCounts

    init(
        id: UUID,
        code: String,
        title: String,
        status: String,
        term: String?,
        startDate: String?,
        endDate: String?,
        description: String? = nil,
        bannerURLString: String? = nil,
        lmsProvider: String? = nil,
        counts: CourseCounts = .zero
    ) {
        self.id = id
        self.code = code
        self.title = title
        self.description = description
        self.status = status
        self.term = term
        self.startDate = startDate
        self.endDate = endDate
        self.bannerURLString = bannerURLString
        self.lmsProvider = lmsProvider
        self.counts = counts
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case code
        case title
        case description
        case status
        case term = "termLabel"
        case startDate
        case endDate
        case bannerURLString = "bannerUrl"
        case lmsProvider
        case counts
    }
}

struct ModuleContentCounts: Decodable, Hashable, Sendable {
    let materials: Int
    let presentations: Int
    let assignments: Int
    let quizzes: Int
    let discussions: Int
}

struct ModuleContentSummary: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let moduleID: String?
    let title: String
    let description: String?
    let status: String?
    let type: String?
    let sourceType: String?
    let provider: String?
    let externalURLString: String?
    let position: Int?
    let publishedAt: String?
    let archivedAt: String?
    let closedAt: String?
    let dueDate: String?
    let startDate: String?
    let endDate: String?
    let untilDate: String?
    let startTime: String?
    let endTime: String?
    let slideCount: Int?
    let questionCount: Int?
    let postCount: Int?
    let timeLimitMinutes: Int?
    let maxAttempts: Int?
    let maxScore: Double?
    let passingScore: Double?
    let allowLateSubmission: Bool?
    let submissionMode: String?
    let lockdown: Bool?
    let isGraded: Bool?
    let isPinned: Bool?
    let shareEnabled: Bool?

    init(
        id: String,
        moduleID: String?,
        title: String,
        description: String? = nil,
        status: String? = nil,
        type: String? = nil,
        sourceType: String? = nil,
        provider: String? = nil,
        externalURLString: String? = nil,
        position: Int? = nil,
        publishedAt: String? = nil,
        archivedAt: String? = nil,
        closedAt: String? = nil,
        dueDate: String? = nil,
        startDate: String? = nil,
        endDate: String? = nil,
        untilDate: String? = nil,
        startTime: String? = nil,
        endTime: String? = nil,
        slideCount: Int? = nil,
        questionCount: Int? = nil,
        postCount: Int? = nil,
        timeLimitMinutes: Int? = nil,
        maxAttempts: Int? = nil,
        maxScore: Double? = nil,
        passingScore: Double? = nil,
        allowLateSubmission: Bool? = nil,
        submissionMode: String? = nil,
        lockdown: Bool? = nil,
        isGraded: Bool? = nil,
        isPinned: Bool? = nil,
        shareEnabled: Bool? = nil
    ) {
        self.id = id
        self.moduleID = moduleID
        self.title = title
        self.description = description
        self.status = status
        self.type = type
        self.sourceType = sourceType
        self.provider = provider
        self.externalURLString = externalURLString
        self.position = position
        self.publishedAt = publishedAt
        self.archivedAt = archivedAt
        self.closedAt = closedAt
        self.dueDate = dueDate
        self.startDate = startDate
        self.endDate = endDate
        self.untilDate = untilDate
        self.startTime = startTime
        self.endTime = endTime
        self.slideCount = slideCount
        self.questionCount = questionCount
        self.postCount = postCount
        self.timeLimitMinutes = timeLimitMinutes
        self.maxAttempts = maxAttempts
        self.maxScore = maxScore
        self.passingScore = passingScore
        self.allowLateSubmission = allowLateSubmission
        self.submissionMode = submissionMode
        self.lockdown = lockdown
        self.isGraded = isGraded
        self.isPinned = isPinned
        self.shareEnabled = shareEnabled
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case moduleID = "moduleId"
        case title
        case description
        case status
        case type
        case sourceType
        case provider
        case externalURLString = "externalUrl"
        case position
        case publishedAt
        case archivedAt
        case closedAt
        case dueDate
        case startDate
        case endDate
        case untilDate
        case startTime
        case endTime
        case slideCount
        case questionCount
        case postCount
        case timeLimitMinutes
        case maxAttempts
        case maxScore
        case passingScore
        case allowLateSubmission
        case submissionMode
        case lockdown
        case isGraded
        case isPinned
        case shareEnabled
    }
}

struct ResourceSummary: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    let title: String
    let subtitle: String?
    let status: String?
    let position: Int?
    let publishedAt: String?
    let startAt: String?
    let endAt: String?
    let closedAt: String?
    let counts: ModuleContentCounts?

    init(
        id: String,
        title: String,
        subtitle: String?,
        status: String?,
        position: Int? = nil,
        publishedAt: String? = nil,
        startAt: String? = nil,
        endAt: String? = nil,
        closedAt: String? = nil,
        counts: ModuleContentCounts? = nil
    ) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.status = status
        self.position = position
        self.publishedAt = publishedAt
        self.startAt = startAt
        self.endAt = endAt
        self.closedAt = closedAt
        self.counts = counts
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

        func int(_ names: [String]) -> Int? {
            for name in names {
                guard let key = DynamicKey(stringValue: name) else { continue }
                if let value = try? container.decode(Int.self, forKey: key) {
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
        position = int(["position"])
        publishedAt = string(["publishedAt"])
        startAt = string(["startAt"])
        endAt = string(["endAt"])
        closedAt = string(["closedAt"])
        if let key = DynamicKey(stringValue: "counts") {
            counts = try? container.decode(ModuleContentCounts.self, forKey: key)
        } else {
            counts = nil
        }
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
