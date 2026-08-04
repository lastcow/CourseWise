import SwiftUI

struct LoginView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var email = ""
    @State private var password = ""
    @State private var rememberMe = true
    @FocusState private var focusedField: Field?

    private enum Field { case email, password }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    BrandHeader()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("auth.title")
                            .font(.largeTitle.bold())
                        Text("auth.subtitle")
                            .foregroundStyle(.secondary)
                    }

                    VStack(spacing: 16) {
                        TextField("auth.email", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .password }

                        SecureField("auth.password", text: $password)
                            .textContentType(.password)
                            .focused($focusedField, equals: .password)
                            .submitLabel(.go)
                            .onSubmit(signIn)
                    }
                    .textFieldStyle(.roundedBorder)

                    Toggle("auth.remember", isOn: $rememberMe)

                    if let error = authStore.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.callout)
                            .foregroundStyle(.red)
                    }

                    Button(action: signIn) {
                        HStack {
                            if authStore.isWorking { ProgressView().tint(.white) }
                            Text("auth.signIn")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(email.isEmpty || password.isEmpty || authStore.isWorking)

                    Link(
                        String(localized: "auth.forgotPassword"),
                        destination: AppConfiguration.current.webBaseURL.appending(path: "forgot-password")
                    )
                    .frame(maxWidth: .infinity)
                }
                .padding(28)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .background(Brand.paper.gradient)
        }
    }

    private func signIn() {
        focusedField = nil
        Task { await authStore.login(email: email, password: password, rememberMe: rememberMe) }
    }
}
