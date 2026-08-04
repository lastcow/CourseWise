# CourseWise for iPhone and iPad

Native SwiftUI Universal App for the CourseWise API.

## Requirements

- Xcode 26.6 or newer
- XcodeGen (`brew install xcodegen`)
- iOS/iPadOS 17 or newer

## Generate and open the project

```sh
cd apps/apple
xcodegen generate
open CourseWise.xcodeproj
```

The checked-in project configuration uses automatic signing with Apple team
`KQ77E3R6PM` and bundle identifier `com.coursewise.app`.

Debug builds use `COURSEWISE_API_URL` and `COURSEWISE_WEB_URL` from the scheme
environment when present. They default to the production endpoints:

- `https://api.fsuac.com`
- `https://fsuac.com`

Never put API credentials, refresh tokens, APNs keys, or `.p8` files in this
directory. User sessions are stored in Keychain at runtime.

The product scope, platform decisions and release gates are maintained in
[`docs/apple-platform-plan.md`](../../docs/apple-platform-plan.md).

## Verification

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project CourseWise.xcodeproj -scheme CourseWise \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Before any physical-device installation, run the complete unit and UI suite on
one current iPhone simulator and one current iPad simulator:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project CourseWise.xcodeproj -scheme CourseWise \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=latest' test

DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project CourseWise.xcodeproj -scheme CourseWise \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=latest' test
```

Both commands are release gates. `CourseWiseUITests` verifies the administrator
Dashboard in English and Simplified Chinese, opens every Dashboard component
detail page, and checks portrait and landscape layouts. It uses deterministic
fixtures enabled only in Debug UI-test processes; Release builds cannot bypass
authentication. Only after both simulator suites pass may the app be signed and
installed on a physical iPhone or iPad. Push notifications, Face ID/Touch ID and
other hardware-only behavior must then be validated on the signed device.
