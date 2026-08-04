import SwiftUI

struct RootView: View {
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        Group {
            switch authStore.state {
            case .launching:
                LaunchView()
            case .locked:
                BiometricUnlockView()
            case .signedOut:
                LoginView()
            case .authenticated:
                AppShellView()
            }
        }
        .animation(.snappy, value: authStore.state)
    }
}
private struct LaunchView: View {
    var body: some View {
        ZStack {
            Brand.ink.ignoresSafeArea()
            VStack(spacing: 20) {
                Image("CourseWiseMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 112, height: 112)
                    .accessibilityHidden(true)
                ProgressView()
                    .tint(Brand.paper)
                    .accessibilityLabel(Text("common.loading"))
            }
        }
    }
}
