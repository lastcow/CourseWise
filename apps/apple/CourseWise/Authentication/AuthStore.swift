import Foundation
import Observation
import SwiftUI

enum AuthState: Equatable {
    case launching
    case locked
    case signedOut
    case authenticated
}

@MainActor
@Observable
final class AuthStore {
    private let api: APIClient
    private let keychain = KeychainStore()
    private let biometrics = BiometricAuthenticator()
    private let defaults = UserDefaults.standard
    private var currentRefreshToken: String?

    var state: AuthState = .launching
    var account: Account?
    var errorMessage: String?
    var isWorking = false
    var pendingDeepLink: DeepLink?

    var biometricUnlockEnabled: Bool {
        get { defaults.bool(forKey: "biometricUnlockEnabled") }
        set { defaults.set(newValue, forKey: "biometricUnlockEnabled") }
    }

    init(configuration: AppConfiguration) {
        api = APIClient(configuration: configuration)
#if DEBUG
        if let fixture = UITestFixture.current {
            account = fixture.account
            state = .authenticated
        }
#endif
    }

    func restoreSession() async {
        guard state == .launching else { return }
        if defaults.bool(forKey: "hasSavedSession") {
            state = .locked
        } else {
            state = .signedOut
        }
    }

    func unlock() async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let context = try await biometrics.authenticate()
            guard let refreshToken = try keychain.readRefreshToken(context: context) else {
                clearLocalSession()
                return
            }
            let tokens: AuthTokens = try await api.post(
                "/api/auth/refresh",
                body: RefreshRequest(refreshToken: refreshToken)
            )
            try await persist(tokens: tokens, requiresBiometrics: biometricUnlockEnabled)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func login(email: String, password: String, rememberMe: Bool) async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let tokens: AuthTokens = try await api.post(
                "/api/auth/login",
                body: LoginRequest(email: email, password: password, rememberMe: rememberMe)
            )
            biometricUnlockEnabled = biometrics.availability() != .none
            try await persist(tokens: tokens, requiresBiometrics: biometricUnlockEnabled)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        if let refreshToken = currentRefreshToken {
            let _: EmptyResponse? = try? await api.post(
                "/api/auth/logout",
                body: RefreshRequest(refreshToken: refreshToken)
            )
        }
        let _: EmptyResponse? = try? await api.delete(
            "/api/me/devices/\(DeviceRegistrationRequest.installationID.uuidString)"
        )
        clearLocalSession()
    }

    func setBiometricUnlockEnabled(_ enabled: Bool) async {
        guard enabled != biometricUnlockEnabled else { return }
        do {
            if let currentRefreshToken {
                try keychain.saveRefreshToken(currentRefreshToken, requiresBiometrics: enabled)
            }
            biometricUnlockEnabled = enabled
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func registerForPushNotifications(deviceToken: String) async {
        guard state == .authenticated else { return }
        do {
            let request = DeviceRegistrationRequest.current(apnsToken: deviceToken)
            let _: MobileDeviceSummary = try await api.post("/api/me/devices", body: request)
        } catch {
            // Push registration is retried whenever APNs rotates the token or the app becomes active.
        }
    }

    func authenticatedAPI() -> APIClient { api }

    func handleScenePhase(_ phase: ScenePhase) {
        guard phase == .background, state == .authenticated, biometricUnlockEnabled else { return }
        state = .locked
    }

    private func persist(tokens: AuthTokens, requiresBiometrics: Bool) async throws {
        try keychain.saveRefreshToken(tokens.refreshToken, requiresBiometrics: requiresBiometrics)
        await api.setAccessToken(tokens.accessToken)
        currentRefreshToken = tokens.refreshToken
        account = tokens.user
        defaults.set(true, forKey: "hasSavedSession")
        state = .authenticated
    }

    private func clearLocalSession() {
        try? keychain.deleteRefreshToken()
        Task { await api.setAccessToken(nil) }
        defaults.removeObject(forKey: "hasSavedSession")
        currentRefreshToken = nil
        account = nil
        pendingDeepLink = nil
        state = .signedOut
    }
}

struct EmptyResponse: Codable, Sendable {
    let ok: Bool?
}
