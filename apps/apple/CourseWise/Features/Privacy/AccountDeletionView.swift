import SwiftUI

struct AccountDeletionView: View {
    @Environment(AuthStore.self) private var authStore
    @State private var request: AccountDeletionRequestSummary?
    @State private var isWorking = false
    @State private var isConfirming = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                Text("deletion.explanation")
            }

            if request?.status == "open" {
                Section {
                    Label("deletion.pending", systemImage: "clock.badge.exclamationmark")
                        .foregroundStyle(.orange)
                    Button("deletion.cancel") {
                        Task { await cancel() }
                    }
                } footer: {
                    Text("deletion.pendingHelp")
                }
            } else {
                Section {
                    Button("deletion.request", role: .destructive) {
                        isConfirming = true
                    }
                } footer: {
                    Text("deletion.reviewHelp")
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .navigationTitle("settings.delete")
        .disabled(isWorking)
        .overlay { if isWorking { ProgressView() } }
        .task { await load() }
        .confirmationDialog(
            "deletion.confirmTitle",
            isPresented: $isConfirming,
            titleVisibility: .visible
        ) {
            Button("deletion.confirm", role: .destructive) {
                Task { await submit() }
            }
            Button("common.cancel", role: .cancel) {}
        } message: {
            Text("deletion.confirmMessage")
        }
    }

    private func load() async {
        isWorking = true
        do {
            let value: AccountDeletionRequestResponse = try await authStore.authenticatedAPI().get(
                "/api/me/account-deletion-request"
            )
            request = value.request
        } catch {
            errorMessage = error.localizedDescription
        }
        isWorking = false
    }

    private func submit() async {
        isWorking = true
        errorMessage = nil
        do {
            request = try await authStore.authenticatedAPI().post(
                "/api/me/account-deletion-request",
                body: EmptyRequest()
            )
        } catch {
            errorMessage = error.localizedDescription
        }
        isWorking = false
    }

    private func cancel() async {
        isWorking = true
        errorMessage = nil
        do {
            let value: AccountDeletionRequestResponse = try await authStore.authenticatedAPI().delete(
                "/api/me/account-deletion-request"
            )
            request = value.request
        } catch {
            errorMessage = error.localizedDescription
        }
        isWorking = false
    }
}
