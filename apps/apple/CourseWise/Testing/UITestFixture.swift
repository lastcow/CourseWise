#if DEBUG
import Foundation

struct UITestFixture: Sendable {
    let account: Account
    let courses: [CourseSummary]
    let modules: [ResourceSummary]
    let materials: [ModuleContentSummary]
    let presentations: [ModuleContentSummary]
    let assignments: [ModuleContentSummary]
    let quizzes: [ModuleContentSummary]
    let discussions: [ModuleContentSummary]
    let presentationSlides: [String: [PresentationSlideSummary]]
    let assignmentSubmissions: [String: [AssignmentSubmissionSummary]]
    let quizQuestions: [String: [QuizQuestionSummary]]
    let discussionPosts: [String: DiscussionPostsPage]

    static var current: UITestFixture? {
        let environment = ProcessInfo.processInfo.environment
        guard environment["COURSEWISE_UI_TESTING"] == "1" else { return nil }

        let role = UserRole(rawValue: environment["COURSEWISE_UI_TEST_ROLE"] ?? "admin") ?? .admin
        let name: String
        switch role {
        case .student: name = "Student"
        case .teacher: name = "Teacher"
        case .admin: name = "Admin"
        }

        return UITestFixture(
            account: Account(
                id: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
                email: "ui-tests@coursewise.app",
                name: name,
                role: role,
                status: .active,
                preferredLanguage: nil
            ),
            courses: [
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000101")!,
                    code: "DL2026",
                    title: "Deep Learning",
                    status: "active",
                    term: "Summer 2026",
                    startDate: "2026-06-01T00:00:00.000Z",
                    endDate: "2026-08-21T00:00:00.000Z",
                    description: "Build modern AI systems from neural network foundations to production workflows.",
                    counts: CourseCounts(modules: 8, assignments: 12, presentations: 6, students: 32)
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000102")!,
                    code: "SEE-2026",
                    title: "Software Engineering Economics",
                    status: "active",
                    term: "Summer 2026",
                    startDate: "2026-06-01T00:00:00.000Z",
                    endDate: "2026-08-21T00:00:00.000Z",
                    description: "Evaluate engineering decisions through cost, risk, value, and delivery strategy.",
                    lmsProvider: "canvas",
                    counts: CourseCounts(modules: 10, assignments: 9, presentations: 4, students: 28)
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000103")!,
                    code: "MGMT101",
                    title: "Introduction to Management",
                    status: "draft",
                    term: "Fall 2026",
                    startDate: "2026-09-01T00:00:00.000Z",
                    endDate: "2026-12-15T00:00:00.000Z",
                    description: "Explore organizational leadership, decision-making, teams, and operations.",
                    counts: CourseCounts(modules: 6, assignments: 7, presentations: 3, students: 24)
                ),
                CourseSummary(
                    id: UUID(uuidString: "00000000-0000-4000-8000-000000000104")!,
                    code: "DES210",
                    title: "Product Design Systems",
                    status: "archived",
                    term: "Spring 2026",
                    startDate: "2026-01-20T00:00:00.000Z",
                    endDate: "2026-05-08T00:00:00.000Z",
                    description: "Create scalable interface foundations across design and engineering teams.",
                    counts: CourseCounts(modules: 7, assignments: 8, presentations: 5, students: 26)
                ),
            ],
            modules: [
                ResourceSummary(
                    id: "00000000-0000-4000-8000-000000000201",
                    title: "Getting Started",
                    subtitle: "Course orientation and learning objectives",
                    status: "published",
                    position: 0,
                    publishedAt: "2026-05-20T14:00:00.000Z",
                    startAt: "2026-06-01T00:00:00.000Z",
                    endAt: "2026-06-07T23:59:59.000Z",
                    counts: ModuleContentCounts(
                        materials: 2,
                        presentations: 1,
                        assignments: 1,
                        quizzes: 1,
                        discussions: 1
                    )
                ),
                ResourceSummary(
                    id: "00000000-0000-4000-8000-000000000202",
                    title: "Neural Network Foundations",
                    subtitle: "Core architectures, activation functions, and optimization",
                    status: "published",
                    position: 1,
                    publishedAt: "2026-05-27T14:00:00.000Z",
                    startAt: "2026-06-08T00:00:00.000Z",
                    endAt: "2026-06-21T23:59:59.000Z",
                    counts: ModuleContentCounts(
                        materials: 4,
                        presentations: 2,
                        assignments: 2,
                        quizzes: 1,
                        discussions: 2
                    )
                ),
                ResourceSummary(
                    id: "00000000-0000-4000-8000-000000000203",
                    title: "Convolutional Networks",
                    subtitle: "Image classification, feature maps, and practical labs",
                    status: "draft",
                    position: 2,
                    startAt: "2026-06-22T00:00:00.000Z",
                    endAt: "2026-07-05T23:59:59.000Z",
                    counts: ModuleContentCounts(
                        materials: 1,
                        presentations: 1,
                        assignments: 2,
                        quizzes: 2,
                        discussions: 0
                    )
                ),
            ],
            materials: [
                ModuleContentSummary(
                    id: "00000000-0000-4000-8000-000000000301",
                    moduleID: "00000000-0000-4000-8000-000000000201",
                    title: "Course Guide",
                    description: "Essential policies, learning outcomes, and weekly expectations.",
                    content: """
                    # Welcome to Deep Learning

                    This guide explains how each week is organized, where to find **learning materials**, and how your work will be assessed.

                    ## Your weekly learning path

                    1. Read the core material before class.
                    2. Join the live teaching session.
                    3. Complete the practice activity.
                    4. Reflect with peers in the weekly discussion.

                    > Consistent preparation matters more than prior machine-learning experience.

                    ## Getting support

                    - Use the course discussion for questions that can help the whole class.
                    - Email the teaching team for private academic concerns.
                    - Contact accessibility services whenever an accommodation would help.

                    `Tip:` Keep this guide bookmarked throughout the term.
                    """,
                    status: "published",
                    type: "document",
                    sourceType: "file_upload",
                    position: 0,
                    publishedAt: "2026-05-21T14:00:00.000Z"
                ),
                ModuleContentSummary(
                    id: "00000000-0000-4000-8000-000000000302",
                    moduleID: "00000000-0000-4000-8000-000000000201",
                    title: "Learning Objectives",
                    description: "What you should understand and be able to demonstrate after orientation.",
                    content: "By the end of orientation, you can describe the course learning path, locate weekly resources, explain the assessment policy, and identify the right support channel for academic or technical questions.",
                    status: "published",
                    type: "document",
                    sourceType: "manual_text",
                    position: 1,
                    publishedAt: "2026-05-21T15:00:00.000Z"
                ),
            ],
            presentations: [
                ModuleContentSummary(
                    id: "00000000-0000-4000-8000-000000000311",
                    moduleID: "00000000-0000-4000-8000-000000000201",
                    title: "Orientation Deck",
                    description: "A visual walkthrough of the course, learning path, and support resources.",
                    status: "published",
                    provider: "gamma",
                    position: 0,
                    publishedAt: "2026-05-22T14:00:00.000Z",
                    slideCount: 12,
                    shareEnabled: true
                ),
            ],
            assignments: [
                ModuleContentSummary(
                    id: "00000000-0000-4000-8000-000000000321",
                    moduleID: "00000000-0000-4000-8000-000000000201",
                    title: "Learning Goals Reflection",
                    description: """
                    # Learning Goals Reflection

                    Describe your goals for this course and identify **one practical application** where deep learning could create meaningful value.

                    ## Your response must include

                    - Two specific learning goals
                    - One real-world problem you want to explore
                    - A short explanation of how you will measure progress

                    ## Submission format

                    Write **300–500 words** in Markdown or attach a PDF. Cite any external sources using links.

                    > Focus on a concrete outcome you can demonstrate by the end of the course.
                    """,
                    status: "published",
                    position: 0,
                    publishedAt: "2026-05-23T14:00:00.000Z",
                    dueDate: "2026-06-05T23:59:00.000Z",
                    maxScore: 10,
                    allowLateSubmission: true,
                    submissionMode: "individual",
                    submissionCount: 28,
                    ungradedSubmissionCount: 6
                ),
            ],
            quizzes: [
                ModuleContentSummary(
                    id: "00000000-0000-4000-8000-000000000331",
                    moduleID: "00000000-0000-4000-8000-000000000201",
                    title: "Orientation Check",
                    description: "Confirm that you understand the course structure and participation expectations.",
                    status: "published",
                    publishedAt: "2026-05-24T14:00:00.000Z",
                    startTime: "2026-06-01T08:00:00.000Z",
                    endTime: "2026-06-07T23:59:00.000Z",
                    questionCount: 8,
                    timeLimitMinutes: 10,
                    maxAttempts: 2,
                    maxScore: 10,
                    passingScore: 7,
                    lockdown: false,
                    attemptCount: 30,
                    pendingReviewCount: 4
                ),
            ],
            discussions: [
                ModuleContentSummary(
                    id: "00000000-0000-4000-8000-000000000341",
                    moduleID: "00000000-0000-4000-8000-000000000201",
                    title: "Introduce Yourself",
                    description: "Share your background, interests, and one question you hope to explore.",
                    status: "published",
                    publishedAt: "2026-05-24T16:00:00.000Z",
                    postCount: 24,
                    isGraded: false,
                    isPinned: true
                ),
            ],
            presentationSlides: [
                "00000000-0000-4000-8000-000000000311": [
                    PresentationSlideSummary(
                        id: "00000000-0000-4000-8000-000000000411",
                        presentationID: "00000000-0000-4000-8000-000000000311",
                        position: 0,
                        title: "Welcome to Deep Learning",
                        content: "Meet the teaching team and see how the course moves from foundations to production-ready AI systems.",
                        speakerNotes: "Invite learners to connect the course outcomes to a project they care about.",
                        layout: "title"
                    ),
                    PresentationSlideSummary(
                        id: "00000000-0000-4000-8000-000000000412",
                        presentationID: "00000000-0000-4000-8000-000000000311",
                        position: 1,
                        title: "How each week works",
                        content: "Read the core material, join the live session, complete the practice activity, and use the discussion to reflect with peers.",
                        layout: "content"
                    ),
                    PresentationSlideSummary(
                        id: "00000000-0000-4000-8000-000000000413",
                        presentationID: "00000000-0000-4000-8000-000000000311",
                        position: 2,
                        title: "Support and resources",
                        content: "Use course discussions for learning questions and email the teaching team for private concerns. Accessibility support is available throughout the term.",
                        layout: "content"
                    ),
                ],
            ],
            assignmentSubmissions: [
                "00000000-0000-4000-8000-000000000321": [
                    AssignmentSubmissionSummary(
                        id: "00000000-0000-4000-8000-000000000441",
                        assignmentID: "00000000-0000-4000-8000-000000000321",
                        studentID: "00000000-0000-4000-8000-000000000501",
                        status: "submitted",
                        textAnswer: """
                        # My learning goals

                        I want to understand how to move from a research notebook to a **reliable production model**.

                        ## Practical application

                        I will prototype an image-quality review tool for a community health program and measure progress through:

                        - Reproducible evaluation results
                        - Clear model limitations
                        - A documented monitoring plan
                        """,
                        attachments: [],
                        submittedAt: "2026-06-04T15:20:00.000Z",
                        createdAt: "2026-06-04T15:10:00.000Z",
                        updatedAt: "2026-06-04T15:20:00.000Z",
                        student: SubmissionStudentSummary(
                            id: "00000000-0000-4000-8000-000000000501",
                            name: "Alex Morgan",
                            email: "alex.morgan@example.edu"
                        )
                    ),
                    AssignmentSubmissionSummary(
                        id: "00000000-0000-4000-8000-000000000442",
                        assignmentID: "00000000-0000-4000-8000-000000000321",
                        studentID: "00000000-0000-4000-8000-000000000502",
                        status: "late",
                        textAnswer: "My primary goal is to design trustworthy evaluation workflows for multimodal systems.",
                        attachments: [
                            SubmissionAttachmentSummary(
                                fileAssetID: "00000000-0000-4000-8000-000000000601",
                                filename: "learning-goals.pdf",
                                sizeBytes: 248_120,
                                contentType: "application/pdf"
                            ),
                        ],
                        submittedAt: "2026-06-06T09:12:00.000Z",
                        createdAt: "2026-06-05T21:40:00.000Z",
                        updatedAt: "2026-06-06T09:12:00.000Z",
                        student: SubmissionStudentSummary(
                            id: "00000000-0000-4000-8000-000000000502",
                            name: "Maya Patel",
                            email: "maya.patel@example.edu"
                        )
                    ),
                    AssignmentSubmissionSummary(
                        id: "00000000-0000-4000-8000-000000000443",
                        assignmentID: "00000000-0000-4000-8000-000000000321",
                        studentID: "00000000-0000-4000-8000-000000000503",
                        status: "graded",
                        textAnswer: "I plan to build a transparent forecasting workflow and document every modeling decision.",
                        attachments: [],
                        submittedAt: "2026-06-03T18:05:00.000Z",
                        score: 9,
                        rawScore: 9,
                        feedback: "Clear, measurable goals. Add a specific monitoring metric in your next reflection.",
                        gradedAt: "2026-06-05T11:30:00.000Z",
                        gradedByID: "00000000-0000-4000-8000-000000000001",
                        createdAt: "2026-06-03T17:40:00.000Z",
                        updatedAt: "2026-06-05T11:30:00.000Z",
                        student: SubmissionStudentSummary(
                            id: "00000000-0000-4000-8000-000000000503",
                            name: "Jordan Lee",
                            email: "jordan.lee@example.edu"
                        )
                    ),
                ],
            ],
            quizQuestions: [
                "00000000-0000-4000-8000-000000000331": [
                    QuizQuestionSummary(
                        id: "00000000-0000-4000-8000-000000000421",
                        quizID: "00000000-0000-4000-8000-000000000331",
                        position: 0,
                        prompt: "Where can you find the required learning materials for each week?",
                        type: "single_choice",
                        options: ["Inside the corresponding module", "Only in email", "Only during live class"],
                        explanation: "Every module collects its required materials and activities in learning order.",
                        points: 1
                    ),
                    QuizQuestionSummary(
                        id: "00000000-0000-4000-8000-000000000422",
                        quizID: "00000000-0000-4000-8000-000000000331",
                        position: 1,
                        prompt: "Which channel should you use for a question that may help the whole class?",
                        type: "single_choice",
                        options: ["Course discussion", "Private email", "External social media"],
                        explanation: "Shared learning questions belong in the course discussion so everyone can benefit.",
                        points: 1
                    ),
                ],
            ],
            discussionPosts: [
                "00000000-0000-4000-8000-000000000341": DiscussionPostsPage(
                    posts: [
                        DiscussionPostSummary(
                            id: "00000000-0000-4000-8000-000000000431",
                            topicID: "00000000-0000-4000-8000-000000000341",
                            content: "I am interested in building reliable computer-vision tools for healthcare. I would love to learn how teams evaluate models after deployment.",
                            author: DiscussionAuthorSummary(
                                id: "00000000-0000-4000-8000-000000000001",
                                name: "Alex Morgan",
                                role: "student"
                            ),
                            createdAt: "2026-06-01T10:30:00.000Z"
                        ),
                        DiscussionPostSummary(
                            id: "00000000-0000-4000-8000-000000000432",
                            topicID: "00000000-0000-4000-8000-000000000341",
                            parentID: "00000000-0000-4000-8000-000000000431",
                            content: "That is a strong goal. The monitoring and evaluation module will connect directly to this question.",
                            author: DiscussionAuthorSummary(
                                id: "00000000-0000-4000-8000-000000000002",
                                name: "Dr. Chen",
                                role: "teacher"
                            ),
                            createdAt: "2026-06-01T11:05:00.000Z"
                        ),
                    ],
                    total: 1
                ),
            ]
        )
    }
}
#endif
