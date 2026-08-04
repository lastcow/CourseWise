# CourseWise Apple Platform Plan

Status: implementation in progress
Owner: Chens LLC, doing business as CourseWise
Support: ebiz@chen.me
Platforms: iPhone and iPad
Languages: English and Simplified Chinese (`en`, `zh-CN`)

## Product direction

CourseWise is a native SwiftUI Universal App. The iPhone experience starts on
Dashboard and uses focused push navigation. The iPad experience uses an
adaptive sidebar and detail column, supports landscape, and keeps the same
information architecture and API contract as iPhone.

The design follows Apple platform conventions: system typography, Dynamic
Type, semantic colors, 44-point minimum touch targets, VoiceOver labels,
reduced-motion compatibility, keyboard support on iPad, native sheets and
confirmation dialogs, and privacy-sensitive content hidden from app-switcher
and notification previews where appropriate.

## Scope and delivery

### Foundation — implemented

- SwiftUI Universal App targeting iOS/iPadOS 17 and newer.
- Automatic signing for Apple Team `UT5XXQYCHK` and bundle ID
  `com.coursewise.app`.
- English and Simplified Chinese resources.
- Dashboard-first iPhone navigation and adaptive iPad split navigation.
- Course list and course hub connected to the production CourseWise API.
- Generated CourseWise app icon and in-app mark.
- Keychain session storage protected by Face ID or Touch ID.
- Universal Links and web credentials for `fsuac.com`.
- APNs registration, notification permission UI, per-category preferences,
  quiet-hours backend model, and sensitive-preview defaults.
- In-app account-deletion request and cancellation flow.
- Cloudflare Queue/APNs delivery foundation for announcements and quiz-opening
  notifications.

### Student experience — next vertical slices

1. Today view: upcoming deadlines, current courses, unread announcements,
   unread messages, attendance and grade summary.
2. Assignment detail, Files-based upload, background transfer, submission
   status, and late/missing indicators.
3. Quiz taking with autosave, interruption recovery, countdown accessibility,
   and submitted-result history.
4. Course materials with native PDF viewing, Share Sheet, offline download and
   storage controls.
5. Announcements, discussions and messages with deep links and notification
   routing.
6. Attendance history and gradebook detail with sensitive screen treatment.

### Teacher experience — next vertical slices

1. Teaching dashboard with pending review, attendance sessions, scheduled
   announcements and at-risk alerts.
2. Roster and student detail optimized for iPad split view.
3. Attendance marking with safe bulk actions, offline draft and conflict
   review.
4. Submission review, annotation/feedback, rubric and grade entry.
5. Announcement and message composition with attachment support.
6. Course content management; complex authoring can open the signed-in web
   experience until native feature parity is reached.

### Apple platform completion

- Spotlight indexing for courses and upcoming work.
- Widgets for Today and upcoming deadlines.
- Live Activities only for genuinely time-sensitive active quizzes, after
  product validation.
- Background refresh for small metadata; user-initiated background URLSession
  for uploads/downloads.
- iPad keyboard shortcuts, pointer interactions, drag and drop, multiwindow and
  Stage Manager QA.
- App Intents for opening Today, a course, or pending review without exposing
  education-record data to Siri suggestions.

## Security and privacy defaults

- Refresh tokens stay in `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
  Keychain storage and can be bound to the current biometric set.
- No tokens, APNs keys or student data are written to logs or source control.
- Notification details that may reveal grades or other sensitive records are
  hidden unless the user explicitly enables sensitive previews.
- Account deletion is reviewable rather than immediate because institutions
  may have legal or academic record-retention duties.
- Analytics and crash reporting are opt-in additions only after a vendor and
  student-privacy review.

## Release gates

1. Apply database migration `0057_apple_mobile_foundation.sql`.
2. Create Cloudflare queues `coursewise-push` and
   `coursewise-push-dlq`, then upload `APNS_PRIVATE_KEY` as a Worker secret.
3. Deploy API and web so the AASA file is live with JSON content type.
4. Enable Push Notifications and Associated Domains for the App ID in Apple
   Developer, then regenerate provisioning profiles through automatic signing.
5. Run unit, API, iPhone and iPad UI tests; validate VoiceOver, Dynamic Type,
   dark mode, low connectivity and interrupted uploads.
6. Create the App Store Connect record under Chens LLC, add privacy nutrition
   labels, age rating, support URL, privacy URL and review notes.
7. Ship to internal TestFlight, then external beta, then phased App Store
   release with crash-free and API-error monitoring.

## Recommended App Store metadata

- Name: CourseWise
- Subtitle: Learning and teaching, organized
- Primary category: Education
- Secondary category: Productivity
- Support URL: `https://fsuac.com/contact`
- Privacy URL: `https://fsuac.com/legal/privacy`
- Marketing URL: `https://fsuac.com`
- Copyright: `© 2026 Chens LLC`
- Review contact: `ebiz@chen.me`

Database migration, queue creation, secret upload, production deployment and
TestFlight submission are action-time approval gates. They must not be run as
part of a local build or test command.
