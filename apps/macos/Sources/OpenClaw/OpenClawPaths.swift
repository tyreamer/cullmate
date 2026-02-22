import Foundation

enum OpenClawEnv {
    static func path(_ key: String) -> String? {
        // Normalize env overrides once so UI + file IO stay consistent.
        guard let raw = getenv(key) else { return nil }
        let value = String(cString: raw).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty
        else {
            return nil
        }
        return value
    }
}

enum OpenClawPaths {
    private static let configPathEnv = ["CULLMATE_CONFIG_PATH", "OPENCLAW_CONFIG_PATH"]
    private static let stateDirEnv = ["CULLMATE_STATE_DIR", "OPENCLAW_STATE_DIR"]

    /// Resolves the state directory: env override → ~/.baxbot → ~/.cullmate → ~/.openclaw (first existing wins).
    static var stateDirURL: URL {
        for key in self.stateDirEnv {
            if let override = OpenClawEnv.path(key) {
                return URL(fileURLWithPath: override, isDirectory: true)
            }
        }
        let home = FileManager().homeDirectoryForCurrentUser
        let candidates = [
            home.appendingPathComponent(".baxbot", isDirectory: true),
            home.appendingPathComponent(".cullmate", isDirectory: true),
            home.appendingPathComponent(".openclaw", isDirectory: true),
        ]
        // Use the first directory that already exists; default to .baxbot for new installs.
        return candidates.first(where: { FileManager().fileExists(atPath: $0.path) }) ?? candidates[0]
    }

    private static func resolveConfigCandidate(in dir: URL) -> URL? {
        let candidates = [
            dir.appendingPathComponent("cullmate.json"),
            dir.appendingPathComponent("openclaw.json"),
        ]
        return candidates.first(where: { FileManager().fileExists(atPath: $0.path) })
    }

    static var configURL: URL {
        for key in self.configPathEnv {
            if let override = OpenClawEnv.path(key) {
                return URL(fileURLWithPath: override)
            }
        }
        let stateDir = self.stateDirURL
        if let existing = self.resolveConfigCandidate(in: stateDir) {
            return existing
        }
        // Default for new installs: cullmate.json in the resolved state dir.
        return stateDir.appendingPathComponent("cullmate.json")
    }

    static var workspaceURL: URL {
        self.stateDirURL.appendingPathComponent("workspace", isDirectory: true)
    }
}
