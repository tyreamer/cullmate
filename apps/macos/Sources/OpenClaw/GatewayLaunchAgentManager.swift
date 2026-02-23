import Foundation

enum GatewayLaunchAgentManager {
    private static let logger = Logger(subsystem: "ai.baxbot", category: "gateway.launchd")
    private static let disableLaunchAgentMarker = ".openclaw/disable-launchagent"

    private static var disableLaunchAgentMarkerURL: URL {
        FileManager().homeDirectoryForCurrentUser
            .appendingPathComponent(self.disableLaunchAgentMarker)
    }

    private static var plistURL: URL {
        FileManager().homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(gatewayLaunchdLabel).plist")
    }

    static func isLaunchAgentWriteDisabled() -> Bool {
        if FileManager().fileExists(atPath: self.disableLaunchAgentMarkerURL.path) { return true }
        return false
    }

    static func setLaunchAgentWriteDisabled(_ disabled: Bool) -> String? {
        let marker = self.disableLaunchAgentMarkerURL
        if disabled {
            do {
                try FileManager().createDirectory(
                    at: marker.deletingLastPathComponent(),
                    withIntermediateDirectories: true)
                if !FileManager().fileExists(atPath: marker.path) {
                    FileManager().createFile(atPath: marker.path, contents: nil)
                }
            } catch {
                return error.localizedDescription
            }
            return nil
        }

        if FileManager().fileExists(atPath: marker.path) {
            do {
                try FileManager().removeItem(at: marker)
            } catch {
                return error.localizedDescription
            }
        }
        return nil
    }

    static func isLoaded() async -> Bool {
        guard let loaded = await self.readDaemonLoaded() else { return false }
        return loaded
    }

    static func set(enabled: Bool, bundlePath: String, port: Int) async -> String? {
        _ = bundlePath
        guard !CommandResolver.connectionModeIsRemote() else {
            self.logger.info("launchd change skipped (remote mode)")
            return nil
        }
        if enabled, self.isLaunchAgentWriteDisabled() {
            self.logger.info("launchd enable skipped (disable marker set)")
            return nil
        }

        if enabled {
            // Start: try direct launchctl first (zero CLI dependency), fall back to CLI install.
            let directStart = await self.startDirect()
            if directStart == nil {
                return nil
            }
            self.logger.info("direct launchctl start failed, trying CLI install port=\(port)")
            return await self.runDaemonCommand([
                "install",
                "--force",
                "--port",
                "\(port)",
                "--runtime",
                "node",
            ])
        }

        // Stop: use direct launchctl (zero CLI dependency), fall back to CLI uninstall.
        self.logger.info("launchd disable requested")
        let directResult = await self.stopDirect()
        if directResult == nil {
            return nil
        }
        self.logger.info("direct launchctl stop failed, trying CLI uninstall")
        return await self.runDaemonCommand(["uninstall"])
    }

    static func kickstart() async {
        _ = await self.runDaemonCommand(["restart"], timeout: 20)
    }

    // MARK: - Direct launchctl (no CLI dependency)

    private static var guiDomain: String {
        "gui/\(getuid())"
    }

    private static var serviceTarget: String {
        "\(self.guiDomain)/\(gatewayLaunchdLabel)"
    }

    /// Stop the gateway using launchctl directly — no CLI binary needed.
    static func stopDirect() async -> String? {
        let plist = self.plistURL.path
        let target = self.serviceTarget

        // bootout removes the service from launchd (sends SIGTERM to the process).
        let bootout = await Launchctl.run(["bootout", target])
        if bootout.status == 0 {
            self.logger.info("gateway stopped via launchctl bootout")
            return nil
        }

        // If bootout failed, try unload (legacy but still works).
        if FileManager().fileExists(atPath: plist) {
            let unload = await Launchctl.run(["unload", plist])
            if unload.status == 0 {
                self.logger.info("gateway stopped via launchctl unload")
                return nil
            }
        }

        let msg = "launchctl bootout failed (status \(bootout.status)): \(bootout.output)"
        self.logger.warning("\(msg, privacy: .public)")
        return msg
    }

    /// Start the gateway using launchctl directly — requires plist already written.
    static func startDirect() async -> String? {
        let plist = self.plistURL.path
        let domain = self.guiDomain
        let target = self.serviceTarget

        guard FileManager().fileExists(atPath: plist) else {
            return "Launch agent plist not found at \(plist). Run setup first."
        }

        // Clear any stale registration.
        _ = await Launchctl.run(["bootout", target])
        _ = await Launchctl.run(["unload", plist])

        // Enable + bootstrap + kickstart.
        _ = await Launchctl.run(["enable", target])
        let bootstrap = await Launchctl.run(["bootstrap", domain, plist])
        if bootstrap.status != 0 {
            let msg = "launchctl bootstrap failed (\(bootstrap.status)): \(bootstrap.output)"
            self.logger.warning("\(msg, privacy: .public)")
            return msg
        }
        let kick = await Launchctl.run(["kickstart", "-k", target])
        if kick.status != 0 {
            self.logger.warning("launchctl kickstart failed (\(kick.status)): \(kick.output)")
            // bootstrap succeeded so the service should still start via RunAtLoad
        }
        self.logger.info("gateway started via direct launchctl")
        return nil
    }

    static func launchdConfigSnapshot() -> LaunchAgentPlistSnapshot? {
        LaunchAgentPlist.snapshot(url: self.plistURL)
    }

    static func launchdGatewayLogPath() -> String {
        let snapshot = self.launchdConfigSnapshot()
        if let stdout = snapshot?.stdoutPath?.trimmingCharacters(in: .whitespacesAndNewlines),
           !stdout.isEmpty
        {
            return stdout
        }
        if let stderr = snapshot?.stderrPath?.trimmingCharacters(in: .whitespacesAndNewlines),
           !stderr.isEmpty
        {
            return stderr
        }
        return LogLocator.launchdGatewayLogPath
    }
}

extension GatewayLaunchAgentManager {
    private static func readDaemonLoaded() async -> Bool? {
        let result = await self.runDaemonCommandResult(
            ["status", "--json", "--no-probe"],
            timeout: 15,
            quiet: true)
        guard result.success, let payload = result.payload else { return nil }
        guard
            let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
            let service = json["service"] as? [String: Any],
            let loaded = service["loaded"] as? Bool
        else {
            return nil
        }
        return loaded
    }

    private struct CommandResult {
        let success: Bool
        let payload: Data?
        let message: String?
    }

    private struct ParsedDaemonJson {
        let text: String
        let object: [String: Any]
    }

    private static func runDaemonCommand(
        _ args: [String],
        timeout: Double = 15,
        quiet: Bool = false) async -> String?
    {
        let result = await self.runDaemonCommandResult(args, timeout: timeout, quiet: quiet)
        if result.success { return nil }
        return result.message ?? "Gateway daemon command failed"
    }

    private static func runDaemonCommandResult(
        _ args: [String],
        timeout: Double,
        quiet: Bool) async -> CommandResult
    {
        let command = CommandResolver.openclawCommand(
            subcommand: "gateway",
            extraArgs: self.withJsonFlag(args),
            // Launchd management must always run locally, even if remote mode is configured.
            configRoot: ["gateway": ["mode": "local"]])
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = CommandResolver.preferredPaths().joined(separator: ":")
        let response = await ShellExecutor.runDetailed(command: command, cwd: nil, env: env, timeout: timeout)
        let parsed = self.parseDaemonJson(from: response.stdout) ?? self.parseDaemonJson(from: response.stderr)
        let ok = parsed?.object["ok"] as? Bool
        let message = (parsed?.object["error"] as? String) ?? (parsed?.object["message"] as? String)
        let payload = parsed?.text.data(using: .utf8)
            ?? (response.stdout.isEmpty ? response.stderr : response.stdout).data(using: .utf8)
        let success = ok ?? response.success
        if success {
            return CommandResult(success: true, payload: payload, message: nil)
        }

        if quiet {
            return CommandResult(success: false, payload: payload, message: message)
        }

        let detail = message ?? self.summarize(response.stderr) ?? self.summarize(response.stdout)
        let exit = response.exitCode.map { "exit \($0)" } ?? (response.errorMessage ?? "failed")
        let fullMessage = detail.map { "Gateway daemon command failed (\(exit)): \($0)" }
            ?? "Gateway daemon command failed (\(exit))"
        self.logger.error("\(fullMessage, privacy: .public)")
        return CommandResult(success: false, payload: payload, message: detail)
    }

    private static func withJsonFlag(_ args: [String]) -> [String] {
        if args.contains("--json") { return args }
        return args + ["--json"]
    }

    private static func parseDaemonJson(from raw: String) -> ParsedDaemonJson? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let start = trimmed.firstIndex(of: "{"),
              let end = trimmed.lastIndex(of: "}")
        else {
            return nil
        }
        let jsonText = String(trimmed[start...end])
        guard let data = jsonText.data(using: .utf8) else { return nil }
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return ParsedDaemonJson(text: jsonText, object: object)
    }

    private static func summarize(_ text: String) -> String? {
        let lines = text
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard let last = lines.last else { return nil }
        let normalized = last.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return normalized.count > 200 ? String(normalized.prefix(199)) + "…" : normalized
    }
}
