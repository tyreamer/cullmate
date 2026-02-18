# BaxBot Frictionless Contract

Every release must satisfy all eight constraints. If a constraint cannot be met, the feature ships disabled or deferred.

1. **No internet required** — The app must launch, display the UI, and perform basic local operations (browse photos, view metadata) without any network connection.

2. **No accounts or API keys** — A fresh install must be usable immediately. No sign-up, no API key entry, no OAuth flow required for core functionality.

3. **No terminal** — Users never need to open Terminal.app. All installation, configuration, and operation happens through the GUI or standard macOS mechanisms (DMG drag-install, System Preferences).

4. **Non-destructive defaults** — No operation deletes, moves, or modifies original photo files unless the user explicitly opts in. Default behavior is always read-only or copy-on-write.

5. **No remote skill installs** — Bundled skills only. The app does not fetch, download, or execute skill packages from any remote registry at runtime.

6. **No telemetry** — No analytics, crash reporting, or diagnostic data is sent anywhere. All data stays on the user's machine.

7. **No background network activity** — The app does not phone home for update checks, license validation, feature flags, or any other purpose unless the user explicitly enables it.

8. **Local-first data** — All photo catalogs, metadata, cull decisions, and preferences are stored locally in user-accessible formats. No cloud sync, no remote database.
