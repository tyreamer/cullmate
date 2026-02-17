import AppKit
import Foundation
import OSLog
import UserNotifications

/// Watches `/Volumes` for newly mounted volumes that look like camera cards (contain DCIM or PRIVATE).
/// When detected, sends a macOS notification. If the user clicks the notification action, opens the
/// Cullmate UI with the ingest modal pre-filled to the detected source path.
@MainActor
final class VolumeWatcher {
    static let shared = VolumeWatcher()

    static let notificationCategory = "CULLMATE_CAMERA_CARD"
    static let actionIdentifier = "INGEST_ACTION"

    private let logger = Logger(subsystem: "ai.openclaw", category: "volume-watcher")
    private var fsWatcher: CoalescingFSEventsWatcher?
    private var knownVolumes: Set<String> = []
    private var isRunning = false

    /// Volumes that have already triggered a notification in this session, to avoid repeat alerts.
    private var notifiedVolumes: Set<String> = []

    func start() {
        guard !self.isRunning else { return }
        self.isRunning = true

        // Snapshot current volumes so we don't alert for already-mounted cards
        self.knownVolumes = self.currentVolumes()

        // Register notification category with action button
        self.registerNotificationCategory()

        let watcher = CoalescingFSEventsWatcher(
            paths: ["/Volumes"],
            queueLabel: "ai.openclaw.volume-watcher",
            coalesceDelay: 1.5 // Volumes need time to fully mount
        ) { [weak self] in
            Task { @MainActor in
                self?.handleVolumesChanged()
            }
        }
        self.fsWatcher = watcher
        watcher.start()

        self.logger.info("Volume watcher started with \(self.knownVolumes.count) existing volumes")
    }

    func stop() {
        self.fsWatcher?.stop()
        self.fsWatcher = nil
        self.isRunning = false
        self.logger.info("Volume watcher stopped")
    }

    /// Called by the notification delegate when the user clicks the "Ingest & Verify" action.
    func handleNotificationAction(sourcePath: String) {
        Task { @MainActor in
            await self.openIngestForPath(sourcePath)
        }
    }

    // MARK: - Private

    private func currentVolumes() -> Set<String> {
        let fm = FileManager.default
        guard let entries = try? fm.contentsOfDirectory(atPath: "/Volumes") else {
            return []
        }
        return Set(entries.map { "/Volumes/\($0)" })
    }

    private func handleVolumesChanged() {
        let current = self.currentVolumes()
        let newVolumes = current.subtracting(self.knownVolumes)
        self.knownVolumes = current

        for volume in newVolumes {
            self.checkForCameraCard(at: volume)
        }
    }

    private func checkForCameraCard(at volumePath: String) {
        // Skip if already notified this session
        guard !self.notifiedVolumes.contains(volumePath) else { return }

        let fm = FileManager.default
        let dcimPath = "\(volumePath)/DCIM"
        let privatePath = "\(volumePath)/PRIVATE"

        var sourcePath: String?
        if fm.fileExists(atPath: dcimPath) {
            sourcePath = dcimPath
        } else if fm.fileExists(atPath: privatePath) {
            sourcePath = privatePath
        }

        guard let sourcePath else { return }

        let volumeName = (volumePath as NSString).lastPathComponent
        self.notifiedVolumes.insert(volumePath)
        self.logger.info("Camera card detected: \(volumeName, privacy: .public) at \(sourcePath, privacy: .public)")

        Task {
            await self.sendCameraCardNotification(volumeName: volumeName, sourcePath: sourcePath)
        }
    }

    private func registerNotificationCategory() {
        let ingestAction = UNNotificationAction(
            identifier: Self.actionIdentifier,
            title: "Ingest & Verify",
            options: [.foreground]
        )
        let category = UNNotificationCategory(
            identifier: Self.notificationCategory,
            actions: [ingestAction],
            intentIdentifiers: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    private func sendCameraCardNotification(volumeName: String, sourcePath: String) async {
        let center = UNUserNotificationCenter.current()

        // Request permission if needed
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            let granted = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            if granted != true {
                self.logger.warning("Notification permission denied; cannot show camera card alert")
                return
            }
        } else if settings.authorizationStatus != .authorized {
            self.logger.warning("Notifications not authorized (status=\(settings.authorizationStatus.rawValue))")
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Camera card detected"
        content.body = "\(volumeName) — Ingest & Verify?"
        content.categoryIdentifier = Self.notificationCategory
        content.userInfo = ["sourcePath": sourcePath]
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "cullmate-camera-\(volumeName)",
            content: content,
            trigger: nil
        )

        do {
            try await center.add(request)
            self.logger.info("Camera card notification sent for \(volumeName, privacy: .public)")
        } catch {
            self.logger.error("Failed to send camera card notification: \(error.localizedDescription)")
        }
    }

    private func openIngestForPath(_ sourcePath: String) async {
        do {
            let config = try await GatewayEndpointStore.shared.requireConfig()
            var url = try GatewayEndpointStore.dashboardURL(
                for: config,
                mode: AppStateStore.shared.connectionMode
            )
            if var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
                var items = components.queryItems ?? []
                items.append(URLQueryItem(name: "modal", value: "ingest"))
                items.append(URLQueryItem(name: "source_path", value: sourcePath))
                components.queryItems = items
                if let built = components.url {
                    url = built
                }
            }
            NSWorkspace.shared.open(url)
        } catch {
            self.logger.error("Failed to open ingest for \(sourcePath, privacy: .public): \(error.localizedDescription)")
        }
    }
}
