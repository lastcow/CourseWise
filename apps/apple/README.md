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
`UT5XXQYCHK` and bundle identifier `com.coursewise.app`.

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

Run the `CourseWise` scheme on at least one current iPhone simulator and one
current iPad simulator before opening a pull request. Push notification tokens
must be validated on a signed physical device.
