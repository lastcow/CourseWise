import SwiftUI

struct BiometricUnlockView: View {
    @Environment(AuthStore.self) private var authStore

    var body: some View {
        ZStack {
            Brand.ink.ignoresSafeArea()
            VStack(spacing: 24) {
                Image("CourseWiseMark")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 104, height: 104)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))

                Button {
                    Task { await authStore.unlock() }
                } label: {
                    Label("auth.biometrics", systemImage: "faceid")
                        .frame(minWidth: 220)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .tint(Brand.evergreen)
                .disabled(authStore.isWorking)

                if authStore.isWorking { ProgressView().tint(Brand.paper) }
                if let error = authStore.errorMessage {
                    Text(error)
                        .font(.callout)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }
        }
        .task { await authStore.unlock() }
    }
}
