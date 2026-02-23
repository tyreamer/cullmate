import AppKit
import Foundation
import OpenClawDiscovery
import OpenClawIPC
import SwiftUI
import UserNotifications

extension OnboardingView {
    func selectLocalGateway() {
        self.state.connectionMode = .local
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectUnconfiguredGateway() {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.state.connectionMode = .unconfigured
        self.preferredGatewayID = nil
        self.showAdvancedConnection = false
        GatewayDiscoveryPreferences.setPreferredStableID(nil)
    }

    func selectRemoteGateway(_ gateway: GatewayDiscoveryModel.DiscoveredGateway) {
        Task { await self.onboardingWizard.cancelIfRunning() }
        self.preferredGatewayID = gateway.stableID
        GatewayDiscoveryPreferences.setPreferredStableID(gateway.stableID)

        if self.state.remoteTransport == .direct {
            if let url = GatewayDiscoveryHelpers.directUrl(for: gateway) {
                self.state.remoteUrl = url
            }
        } else if let host = GatewayDiscoveryHelpers.sanitizedTailnetHost(gateway.tailnetDns) ?? gateway.lanHost {
            let user = NSUserName()
            self.state.remoteTarget = GatewayDiscoveryModel.buildSSHTarget(
                user: user,
                host: host,
                port: gateway.sshPort)
            OpenClawConfigFile.setRemoteGatewayUrl(
                host: gateway.serviceHost ?? host,
                port: gateway.servicePort ?? gateway.gatewayPort)
        }
        self.state.remoteCliPath = gateway.cliPath ?? ""

        self.state.connectionMode = .remote
        MacNodeModeCoordinator.shared.setPreferredGatewayStableID(gateway.stableID)
    }

    func openSettings(tab: SettingsTab) {
        SettingsTabRouter.request(tab)
        self.openSettings()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .openclawSelectSettingsTab, object: tab)
        }
    }

    func handleBack() {
        withAnimation {
            self.currentPage = max(0, self.currentPage - 1)
        }
    }

    func handleNext() {
        if self.isWizardBlocking { return }
        if self.currentPage < self.pageCount - 1 {
            withAnimation { self.currentPage += 1 }
            // Start gateway setup when the user navigates to the setup page (page 12).
            // We trigger here instead of .task {} because all pages are pre-rendered in an HStack,
            // so .task fires immediately on app launch rather than when the page is visible.
            if self.activePageIndex == 12 {
                Task { await self.runGatewaySetup() }
            }
        } else {
            self.finish()
        }
    }

    func finish() {
        UserDefaults.standard.set(true, forKey: "openclaw.onboardingSeen")
        UserDefaults.standard.set(currentOnboardingVersion, forKey: onboardingVersionKey)

        // Request notification permission proactively so card detection alerts work immediately.
        Task {
            let center = UNUserNotificationCenter.current()
            let settings = await center.notificationSettings()
            if settings.authorizationStatus == .notDetermined {
                _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            }
        }

        OnboardingController.shared.close()

        // Auto-open the Studio Manager (web dashboard).
        Task { @MainActor in
            do {
                let config = try await GatewayEndpointStore.shared.requireConfig()
                let url = try GatewayEndpointStore.dashboardURL(
                    for: config, mode: AppStateStore.shared.connectionMode)
                NSWorkspace.shared.open(url)
            } catch {
                // Gateway already confirmed ready; URL build failed — menu bar icon is there.
            }
        }
    }

    @MainActor
    func runGatewaySetup() async {
        self.gatewaySetupDone = false
        self.gatewaySetupFailed = false
        self.gatewaySetupStatus = "Starting BaxBot\u{2026}"

        // 1. Activate the gateway process manager.
        GatewayProcessManager.shared.setActive(true)

        // 2. Poll until the gateway is healthy (up to 60 seconds).
        let startTime = Date()
        let deadline = startTime.addingTimeInterval(60)
        var lastStatus = GatewayProcessManager.shared.status
        var directProbeSucceeded = false

        while Date() < deadline {
            let status = GatewayProcessManager.shared.status
            let elapsed = Date().timeIntervalSince(startTime)

            // Primary check: process manager reports healthy.
            switch status {
            case .running, .attachedExisting:
                await self.completeSetup()
                return
            default:
                break
            }

            // Fallback: direct health probe on the port (catches label mismatches,
            // already-running gateways the process manager can't see, etc.).
            if !directProbeSucceeded {
                let port = GatewayEnvironment.gatewayPort()
                if await self.probeGatewayHealth(port: port) {
                    directProbeSucceeded = true
                    // Tell the process manager to latch on.
                    GatewayProcessManager.shared.setActive(true)
                    await self.completeSetup()
                    return
                }
            }

            // Update status message (no jargon).
            if elapsed > 25 {
                self.gatewaySetupStatus = "Almost there\u{2026}"
            } else if elapsed > 10 {
                self.gatewaySetupStatus = "Preparing BaxBot\u{2026}"
            }

            // Retry activation on failure/stop.
            switch status {
            case .failed:
                GatewayProcessManager.shared.setActive(true)
            case .stopped:
                if lastStatus != .stopped {
                    GatewayProcessManager.shared.setActive(true)
                }
            default:
                break
            }

            lastStatus = status
            try? await Task.sleep(nanoseconds: 800_000_000)
        }

        // Timeout.
        withAnimation {
            self.gatewaySetupStatus = "BaxBot is taking longer than expected to start. Try clicking \u{201C}Try Again\u{201D}."
            self.gatewaySetupFailed = true
        }
    }

    @MainActor
    private func completeSetup() async {
        withAnimation { self.gatewaySetupStatus = "Almost ready\u{2026}" }
        try? await Task.sleep(nanoseconds: 400_000_000)
        withAnimation { self.gatewaySetupDone = true }
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        self.finish()
    }

    /// Direct HTTP health probe — bypasses GatewayProcessManager and launchd labels.
    private func probeGatewayHealth(port: Int) async -> Bool {
        guard let url = URL(string: "http://127.0.0.1:\(port)/") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        request.httpMethod = "GET"
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                return true
            }
        } catch {
            // Not reachable yet.
        }
        return false
    }

    func pickStorageFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Select Folder"
        panel.message = self.storagePickerTarget == .primary
            ? "Choose where BaxBot should save your photos."
            : "Choose a backup location (ideally a separate drive)."
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            switch self.storagePickerTarget {
            case .primary:
                self.storagePrimaryDest = url.path
            case .backup:
                self.storageBackupDest = url.path
            }
        }
    }

    func isSameVolume(_ pathA: String, _ pathB: String) -> Bool {
        let urlA = URL(fileURLWithPath: pathA)
        let urlB = URL(fileURLWithPath: pathB)
        let volA = try? urlA.resourceValues(forKeys: [.volumeIdentifierKey]).volumeIdentifier as? NSObject
        let volB = try? urlB.resourceValues(forKeys: [.volumeIdentifierKey]).volumeIdentifier as? NSObject
        guard let a = volA, let b = volB else { return false }
        return a.isEqual(b)
    }

    func copyToPasteboard(_ text: String) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
        self.copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.copied = false }
    }

    func startAnthropicOAuth() {
        guard !self.anthropicAuthBusy else { return }
        self.anthropicAuthBusy = true
        defer { self.anthropicAuthBusy = false }

        do {
            let pkce = try AnthropicOAuth.generatePKCE()
            self.anthropicAuthPKCE = pkce
            let url = AnthropicOAuth.buildAuthorizeURL(pkce: pkce)
            NSWorkspace.shared.open(url)
            self.anthropicAuthStatus = "Browser opened. After approving, paste the `code#state` value here."
        } catch {
            self.anthropicAuthStatus = "Failed to start OAuth: \(error.localizedDescription)"
        }
    }

    @MainActor
    func finishAnthropicOAuth() async {
        guard !self.anthropicAuthBusy else { return }
        guard let pkce = self.anthropicAuthPKCE else { return }
        self.anthropicAuthBusy = true
        defer { self.anthropicAuthBusy = false }

        guard let parsed = AnthropicOAuthCodeState.parse(from: self.anthropicAuthCode) else {
            self.anthropicAuthStatus = "OAuth failed: missing or invalid code/state."
            return
        }

        do {
            let creds = try await AnthropicOAuth.exchangeCode(
                code: parsed.code,
                state: parsed.state,
                verifier: pkce.verifier)
            try OpenClawOAuthStore.saveAnthropicOAuth(creds)
            self.refreshAnthropicOAuthStatus()
            self.anthropicAuthStatus = "Connected. BaxBot can now use Claude."
        } catch {
            self.anthropicAuthStatus = "OAuth failed: \(error.localizedDescription)"
        }
    }

    func pollAnthropicClipboardIfNeeded() {
        guard self.currentPage == self.anthropicAuthPageIndex else { return }
        guard self.anthropicAuthPKCE != nil else { return }
        guard !self.anthropicAuthBusy else { return }
        guard self.anthropicAuthAutoDetectClipboard else { return }

        let pb = NSPasteboard.general
        let changeCount = pb.changeCount
        guard changeCount != self.anthropicAuthLastPasteboardChangeCount else { return }
        self.anthropicAuthLastPasteboardChangeCount = changeCount

        guard let raw = pb.string(forType: .string), !raw.isEmpty else { return }
        guard let parsed = AnthropicOAuthCodeState.parse(from: raw) else { return }
        guard let pkce = self.anthropicAuthPKCE, parsed.state == pkce.verifier else { return }

        let next = "\(parsed.code)#\(parsed.state)"
        if self.anthropicAuthCode != next {
            self.anthropicAuthCode = next
            self.anthropicAuthStatus = "Detected `code#state` from clipboard."
        }

        guard self.anthropicAuthAutoConnectClipboard else { return }
        Task { await self.finishAnthropicOAuth() }
    }
}
