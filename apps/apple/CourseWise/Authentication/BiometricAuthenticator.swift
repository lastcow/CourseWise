import Foundation
import LocalAuthentication

struct AuthenticationContext: LAContextProvider, @unchecked Sendable {
    let context: LAContext
    var rawContext: AnyObject { context }
}
struct BiometricAuthenticator: Sendable {
    func availability() -> LABiometryType {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            return .none
        }
        return context.biometryType
    }

    func authenticate() async throws -> AuthenticationContext {
        let context = LAContext()
        context.localizedCancelTitle = String(localized: "common.close")
        try await context.evaluatePolicy(
            .deviceOwnerAuthentication,
            localizedReason: String(localized: "auth.biometricsReason")
        )
        return AuthenticationContext(context: context)
    }
}
