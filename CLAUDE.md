# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is BaxBot?

BaxBot is a local-first Studio Manager for wedding and portrait photographers. It handles everything around the edit — from camera → safe storage → edit handoff (Lightroom/C1) → post-edit packaging + marketing — so the photographer can focus on shooting and editing.

BaxBot is derived from [OpenClaw](https://github.com/openclaw/openclaw) (MIT License). The v1 "Frictionless Contract" requires: no internet needed, no accounts/keys, no terminal, non-destructive defaults, and no remote skill installs. See `PRODUCT_CONSTRAINTS.md` for the full contract.

The app connects through a WebSocket Gateway control plane at `ws://127.0.0.1:18789` and includes a macOS menu bar companion app (SwiftUI).

## Current Product Status (2026-02-18)

**Phase 1 (Safety Appliance)** — COMPLETE
**Phase 1.5 (Structure)** — COMPLETE
**Phase 2+ (Technical Triage, Delivery, Marketing)** — NOT STARTED

See "Roadmap Status" section at the end of this file for the full breakdown.

## Build & Development Commands

```bash
pnpm install              # Install all workspace deps
pnpm ui:build             # Build web UI (required first time)
pnpm build                # Build TypeScript to dist/ (tsdown)

pnpm baxbot ...           # Run CLI from TypeScript (via tsx)
pnpm gateway:watch        # Start gateway with auto-reload on TS changes
pnpm gateway:dev          # Start gateway (dev mode, skip channels)
pnpm ui:dev               # Start web UI dev server (Vite)

pnpm check                # Run format check + typecheck + lint (oxfmt + tsgo + oxlint)
pnpm tsgo                 # Type-check only (no emit)
pnpm lint                 # Lint only (oxlint --type-aware)
pnpm lint:fix             # Auto-fix lint + format issues

pnpm test                 # Run unit + basic tests (vitest, parallel runner)
pnpm test:fast            # Unit tests only (vitest.unit.config.ts)
pnpm test:e2e             # End-to-end tests
pnpm test:live            # Live API tests (needs CULLMATE_LIVE_TEST=1 + real keys)
pnpm test:coverage        # Coverage report (V8, 70% threshold)
pnpm test:watch           # Watch mode
```

To run a single test file: `pnpm vitest run src/path/to/file.test.ts`

## Architecture Overview

```
    ┌─────────────┐
    │   Gateway    │  ws://127.0.0.1:18789
    │ (WebSocket   │  (sessions, presence, cron)
    │  control     │
    │  plane)      │
    └──────┬───────┘
           │
           ├─ Pi Agent (RPC mode with tool/block streaming)
           ├─ CLI (baxbot …)
           ├─ WebChat UI (Lit web components)
           └─ macOS App (SwiftUI menu bar)
```

### Key source directories

- `src/cli/` — CLI wiring, program builder (Commander.js + clack/prompts)
- `src/commands/` — Individual command implementations
- `src/gateway/` — Gateway WebSocket server (Express + WS), RPC methods in `server-methods/`
- `src/agents/` — Pi agent runtime, tool implementations (`tools/`), auth profiles (`auth-profiles/`)
- `src/photo/` — Photo ingest pipeline: scan, copy, hash, verify, report, folder templates, XMP sidecars
- `src/channels/` — Shared channel logic (routing, presence, limits, chunking)
- `src/config/` — Config loading/validation (Zod schemas), session store
- `src/infra/` — Infrastructure utilities (ports, binaries, dotenv, errors, runtime guards)
- `src/media/` — Media pipeline (images, audio, video processing)
- `src/memory/` — QMD (Quantized Memory Database) and embeddings
- `src/browser/` — Browser control (Chrome/Chromium instance management, actions)
- `src/plugin-sdk/` — Plugin SDK types and runtime for extensions
- `src/routing/` — Session key parsing and routing logic
- `src/cron/` — Cron job scheduling and execution
- `src/providers/` — LLM provider integrations
- `src/sessions/` — Session management and storage

### Other important directories

- `ui/` — Web UI (Lit components, Vite build)
- `ui/src/ui/controllers/` — UI data controllers: RPC helpers, state management (~30 files)
- `ui/src/ui/views/` — UI view rendering functions: one per tab/feature (~57 files)
- `ui/src/ui/copy/` — All user-facing strings (no jargon, middle-school reading level)
- `extensions/` — Plugin packages (workspace packages: msteams, matrix, bluebubbles, zalo, etc.)
- `skills/` — Bundled skills (50+)
- `apps/macos/` — macOS companion app (SwiftUI menu bar)
- `docs/` — Documentation (Mintlify-hosted)
- `test/` — Global test setup and helpers
- `config/` — BaxBot default config (`baxbot-defaults.json`)

## Photo Ingest Pipeline

The core BaxBot feature: non-destructive photo import from SD cards/folders to organized projects.

**Pipeline** (`src/photo/`):

1. **Scan** (`scan.ts`) — Walks source directory, filters for media files (jpg, cr2, cr3, nef, arw, dng, raf, rw2, orf, pef, srw, mov, mp4, png, tiff, heic), classifies by media type (RAW/PHOTO/VIDEO), skips dotfiles and non-media
2. **Copy** (`copy.ts`) — Streams files preserving subdirectory structure, computes hash during copy (sha256, blake3, or sha512), atomic rename for crash safety
3. **Verify** (`verify.ts`) — Post-copy integrity check: `none` (skip), `sentinel` (smart sample: first 25 + last 25 by name + top 25 by size), `full` (all files)
4. **Dedupe** — Opt-in (`dedupe: true`): pre-hashes source files, skips identical content across subdirectories (e.g. dual-card shoots). OFF by default.
5. **Backup** — Optional second destination (`backup_dest`): copies all successfully copied files, verifies backup hashes, drives `safe_to_format` verdict
6. **XMP Sidecars** — Optional (`xmp_patch`): writes creator/rights/credit metadata as `.xmp` sidecar files next to copied media (primary + backup)
7. **Report** (`report.ts`) — Generates HTML Safety Report + JSON manifest in `<project>/.cullmate/`

**Folder Templates** (`src/photo/folder-template.ts`, `template-presets.ts`, `template-expand.ts`):

- 5 built-in presets: Classic, Date Organized, Media Split, Camera + Date, Wedding Pro
- 12 expansion tokens: `{YYYY}`, `{MM}`, `{DD}`, `{CLIENT}`, `{JOB}`, `{MEDIA_TYPE}`, `{CAMERA_MODEL}`, `{CAMERA_SERIAL_SHORT}`, `{CAMERA_LABEL}`, `{CARD_LABEL}`, `{EXT}`, `{ORIGINAL_FILENAME}`
- Routing rules match by media type or file extension
- Token context built from EXIF data + user input + defaults

**XMP Sidecars** (`src/photo/xmp/xmp-sidecar.ts`):

- `XmpPatch` type: creator, rights, webStatement, credit
- Reads/merges existing sidecars, writes new ones atomically
- Dublin Core + Adobe namespace support

**Types** (`src/photo/types.ts`): `IngestParams`, `IngestManifest`, `IngestProgressEvent`, `FileEntry`

**Safe-to-format logic**: TRUE only when backup present + zero failures on primary + zero failures on backup + zero verify mismatches on either. FALSE otherwise with detailed reason.

**Project structure created** (classic template):

```
<dest>/<ProjectName>/
├── 01_RAW/          # Copied media files (preserves subdirs)
├── 02_EXPORTS/      # Empty (for user's edits)
├── 03_DELIVERY/     # Empty (for final deliverables)
└── .cullmate/       # Manifest JSON + HTML Safety Report
```

**Agent tool**: `photo.ingest_verify` (`src/agents/tools/ingest-verify-tool.ts`) — Exposes ingest as an RPC-callable tool with progress streaming.

## UI Architecture (Studio Manager)

The UI is a photographer-first app centered on a conversation-driven "Studio Manager" single-screen experience. Advanced OpenClaw features are hidden behind Developer Mode.

**Normal mode (default)**: Studio Manager timeline fills the screen. Minimal header with BaxBot logo + gear icon. No multi-tab navigation. Gear icon opens Settings as a sheet overlay. The timeline is a deterministic state machine:

- `storage_missing` → greeting + "Set up storage" card
- `template_missing` → "Storage is set up" + "Choose a template" card
- `profile_missing` → "Add studio profile" card (optional, skippable)
- `card_detected` → "Card detected: EOS R5" + "Save photos safely" card
- `idle` → "Ready when you are" + "Save photos safely" card
- `running` → StatusCard with progress (scanning → copying → verifying)
- `done` → ResultCard with Safe-to-format YES/NO + action buttons

**Developer Mode**: Full multi-tab shell with Home, Projects, Settings tabs + advanced sidebar (Chat, Overview, Channels, etc.). "Import Photos" button in topbar. Old Home view and ingest modal.

**Key UI files**:

- `ui/src/ui/app.ts` — Main `OpenClawApp` LitElement with all `@state()` fields
- `ui/src/ui/app-view-state.ts` — `AppViewState` type (all state + handler signatures)
- `ui/src/ui/app-render.ts` — `renderApp()` top-level render function, conditionally renders Studio Manager (normal) vs legacy shell (dev)
- `ui/src/ui/views/studio-manager.ts` — `renderStudioManager()` with sub-renderers for text bubbles, action cards, status cards, result cards, form cards
- `ui/src/ui/controllers/studio-manager.ts` — Timeline entry types (discriminated union on `kind`: TextMessage, ActionCard, StatusCard, ResultCard, FormCard) + `buildStarterTimeline()` state machine + `buildNamingTimeline()` pre-ingest naming
- `ui/src/ui/copy/studio-manager-copy.ts` — All user-facing strings (no jargon, middle-school reading level)
- `ui/src/ui/navigation.ts` — `Tab` union type, `PRIMARY_TABS`, `ADVANCED_TAB_GROUPS`
- `ui/src/ui/storage.ts` — `UiSettings` (localStorage persistence, includes `developerMode`, `defaultSaveLocation`, `defaultVerifyMode`)

**Storage setup** (first-run onboarding):

- `ui/src/ui/controllers/storage.ts` — `StorageConfig` (primaryDest + backupDest), localStorage persistence
- `ui/src/ui/views/storage-setup.ts` — Two-step setup dialog (primary + backup), volume cards, same-folder/same-volume validation

**Studio Profile** (photographer identity for XMP metadata):

- `ui/src/ui/controllers/studio-profile.ts` — `StudioProfile` type (displayName, studioName, website, instagram, city, copyrightLine), localStorage persistence
- `ui/src/ui/views/studio-profile-setup.ts` — Setup form with auto-generated copyright line

**Smart Organizer** (AI-powered folder template generation, developer mode only):

- `ui/src/ui/controllers/ai-provider.ts` — `FolderTemplateAIProvider` interface, `NullFolderTemplateProvider`
- `ui/src/ui/controllers/ai-provider-ollama.ts` — `OllamaFolderTemplateProvider` (dev-only, wraps gateway RPC)
- `ui/src/ui/controllers/ai-provider-factory.ts` — Factory: Ollama in dev mode, Null in normal mode
- `src/photo/template-ai-validate.ts` — Validates AI-generated templates with user-friendly errors
- `src/photo/template-from-prompt.ts` — Ollama integration for plain-English → template generation

**Settings** (`ui/src/ui/views/settings.ts`):

- Storage & Backup section (primary/backup paths, change button)
- Folder Structure section (template display, change button)
- Profile section (name, edit/toggle buttons)
- Developer Mode toggle

**macOS companion app** (`apps/macos/`):

- `VolumeWatcher.swift` — Monitors `/Volumes` for camera cards (DCIM/PRIVATE detection), sends macOS notifications with "Ingest & Verify" action
- `MenuContentView.swift` — Menu bar UI: "Ingest & Verify", "Open BaxBot", "Open Chat" buttons, gateway lifecycle

**View pattern**: Each tab has a `renderXxx(state: XxxViewState)` function in `ui/src/ui/views/`. Views receive a typed state prop object (never the full AppViewState) and return Lit `html` templates.

**Controller pattern**: `ui/src/ui/controllers/` files handle RPC calls to the gateway and state mutations. They receive the app state object and mutate it directly (Lit reactivity).

**Copy conventions**: All user-facing strings live in `ui/src/ui/copy/` files. No jargon (hash/checksum/manifest/Ollama/LLM). "Safety Report" never "receipt". Copy-only, never deletes originals. Middle-school reading level.

## Tech Stack

- **TypeScript (ESM, strict mode)** — Target ES2023, Module NodeNext
- **Node 22+** required, **pnpm 10.23** package manager
- **Vitest** for testing (V8 coverage, forks pool)
- **Oxlint** (type-aware) + **Oxfmt** for linting/formatting
- **tsdown** for bundling to `dist/`
- **Lit** for web UI components, **Vite** for UI dev server
- **Zod** for config schema validation
- **Express + ws** for Gateway server
- Native app: SwiftUI (macOS)

## Coding Conventions

- Strict TypeScript — avoid `any`; use `Type.Unsafe` for tool schemas if needed.
- Keep files under ~500-700 LOC; split when larger.
- Use `createDefaultDeps` for dependency injection in commands.
- CLI progress: use `src/cli/progress.ts` (don't hand-roll spinners).
- Terminal output: use `src/terminal/table.ts` for tables, `src/terminal/palette.ts` for colors.
- Tool schemas: avoid `Type.Union` / `anyOf` / `oneOf` / `allOf`; use `stringEnum`/`optionalStringEnum` for string lists.
- Product name: **BaxBot** (PascalCase) in docs/headings; `baxbot` (lowercase) for CLI/package/config.
- User-facing terminal/UI copy should prefer **BaxBot/Cullmate** wording over OpenClaw (except where compatibility explicitly requires the upstream name).
- Internal TS types still use `OpenClaw` prefix (e.g. `OpenClawConfig`) — TODO(rename) for future cleanup.
- Remaining `OPENCLAW_*` and `CULLMATE_*` env vars plus `.cullmate/` directory names are intentional backward compatibility — do not rename these.

## Plugin/Extension Rules

- Plugin deps go in the extension's own `package.json`, not root.
- Avoid `workspace:*` in plugin `dependencies` (breaks npm install). Use `devDependencies` or `peerDependencies` for `baxbot`.
- Runtime resolves `openclaw/plugin-sdk` via jiti alias (legacy path alias still active).
- When refactoring shared channel logic, consider **all** built-in + extension channels.

## Testing Notes

- Tests: colocated `*.test.ts`, e2e in `*.e2e.test.ts`, live in `*.live.test.ts`.
- Coverage thresholds: 70% lines/functions/statements, 55% branches.
- Do not set test workers above 16.
- Use `vi.stubEnv()` for environment mocking (auto-unstubbed per test).
- Live tests require `CULLMATE_LIVE_TEST=1` (or legacy `OPENCLAW_LIVE_TEST=1`).

## Important Operational Notes

- Never update the Carbon dependency (`@buape/carbon`).
- Dependencies with `pnpm.patchedDependencies` must use exact versions (no `^`/`~`).
- Patching dependencies requires explicit approval.
- Version locations for releases: `package.json`, `apps/macos/Sources/OpenClaw/Resources/Info.plist`.
- Config defaults for BaxBot are in `config/baxbot-defaults.json` — keeps remote features disabled by default.
- See `PRODUCT_CONSTRAINTS.md` for the Frictionless Contract that every release must satisfy.

## Roadmap Status

### Phase 1 — Safety Appliance: COMPLETE

| Feature                       | Status | Location                                          |
| ----------------------------- | ------ | ------------------------------------------------- |
| Verified two-copy ingest      | Done   | `src/photo/ingest.ts`, `copy.ts`, `verify.ts`     |
| Safe-to-format receipt (HTML) | Done   | `src/photo/report.ts`                             |
| JSON manifest                 | Done   | `src/photo/report.ts`                             |
| Backup to second destination  | Done   | `src/photo/ingest.ts` (backup phases)             |
| Dedupe (opt-in)               | Done   | `src/photo/ingest.ts` (pre-hash dedup)            |
| Storage setup wizard          | Done   | `ui/src/ui/views/storage-setup.ts`                |
| Card detection (macOS)        | Done   | `apps/macos/Sources/OpenClaw/VolumeWatcher.swift` |
| Studio Manager timeline UI    | Done   | `ui/src/ui/views/studio-manager.ts`               |
| Settings sheet                | Done   | `ui/src/ui/views/settings.ts`                     |

### Phase 1.5 — Structure: COMPLETE

| Feature                        | Status          | Location                                                          |
| ------------------------------ | --------------- | ----------------------------------------------------------------- |
| Folder templates (5 presets)   | Done            | `src/photo/template-presets.ts`                                   |
| Token expansion (12 tokens)    | Done            | `src/photo/template-expand.ts`                                    |
| Template routing rules         | Done            | `src/photo/folder-template.ts`                                    |
| Smart Organizer (AI templates) | Done (dev-only) | `src/photo/template-from-prompt.ts`, `template-ai-validate.ts`    |
| XMP sidecar writing            | Done            | `src/photo/xmp/xmp-sidecar.ts`                                    |
| Studio Profile (name → XMP)    | Done            | `ui/src/ui/controllers/studio-profile.ts`                         |
| Project naming flow            | Done            | `ui/src/ui/controllers/studio-manager.ts` (`buildNamingTimeline`) |

### Phase 2 — Technical Triage: NOT STARTED

| Feature                                                  | Status    | Notes                                            |
| -------------------------------------------------------- | --------- | ------------------------------------------------ |
| Corruption / readability check                           | Not built | No file-format validation beyond hash match      |
| Technical triage (lens cap / black frames / misfires)    | Not built | —                                                |
| Technical health overlay (sharpness, eye-open, exposure) | Not built | —                                                |
| Burst grouping                                           | Not built | —                                                |
| Time sync (OCR time lord)                                | Not built | Need to validate XMP time-shift support in LR/C1 |

### Phase 3 — Business Engine: NOT STARTED

| Feature                    | Status    | Notes |
| -------------------------- | --------- | ----- |
| Vendor prep engine         | Not built | —     |
| SEO + blogging prep        | Not built | —     |
| Hero picks for sneak peeks | Not built | —     |

### Phase 4 — Post-Edit Delivery & Packaging: NOT STARTED

| Feature                                                    | Status    | Notes |
| ---------------------------------------------------------- | --------- | ----- |
| Export preset library (Web/Print/Social/Vendor/Album/Blog) | Not built | —     |
| Multi-rendition export                                     | Not built | —     |
| Watermark rules                                            | Not built | —     |
| Privacy scrubbing (GPS strip)                              | Not built | —     |
| Delivery package builder (ZIP)                             | Not built | —     |
| Client delivery checklist                                  | Not built | —     |
| Vendor sharing packages                                    | Not built | —     |
| Blog set builder + SEO filenames                           | Not built | —     |
| Album select workflow                                      | Not built | —     |
| Archive lifecycle (3-2-1 backup)                           | Not built | —     |
| Periodic integrity scans                                   | Not built | —     |
| Delivered asset index / search                             | Not built | —     |
| "Publish Wedding" one-button flow                          | Not built | —     |
