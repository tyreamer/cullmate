# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Cullmate?

Cullmate is a frictionless, local-first Mac desktop app for photo management. It is derived from [OpenClaw](https://github.com/openclaw/openclaw) (MIT License). The v1 "Frictionless Contract" requires: no internet needed, no accounts/keys, no terminal, non-destructive defaults, and no remote skill installs. See `PRODUCT_CONSTRAINTS.md` for the full contract.

The app connects through a WebSocket Gateway control plane at `ws://127.0.0.1:18789` and includes a macOS menu bar companion app (SwiftUI).

## Build & Development Commands

```bash
pnpm install              # Install all workspace deps
pnpm ui:build             # Build web UI (required first time)
pnpm build                # Build TypeScript to dist/ (tsdown)

pnpm cullmate ...         # Run CLI from TypeScript (via tsx)
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
           ├─ CLI (cullmate …)
           ├─ WebChat UI (Lit web components)
           └─ macOS App (SwiftUI menu bar)
```

### Key source directories

- `src/cli/` — CLI wiring, program builder (Commander.js + clack/prompts)
- `src/commands/` — Individual command implementations
- `src/gateway/` — Gateway WebSocket server (Express + WS), RPC methods in `server-methods/`
- `src/agents/` — Pi agent runtime, tool implementations (`tools/`), auth profiles (`auth-profiles/`)
- `src/channels/` — Shared channel logic (routing, presence, limits, chunking)
- `src/config/` — Config loading/validation (Zod schemas), session store
- `src/infra/` — Infrastructure utilities (ports, binaries, dotenv, errors, runtime guards)
- `src/media/` — Media pipeline (images, audio, video processing)
- `src/memory/` — QMD (Quantized Memory Database) and embeddings
- `src/browser/` — Browser control (Chrome/Chromium instance management, actions)
- `src/plugin-sdk/` — Plugin SDK types and runtime for extensions

### Other important directories

- `ui/` — Web UI (Lit components, Vite build)
- `extensions/` — Plugin packages (workspace packages: msteams, matrix, bluebubbles, zalo, etc.)
- `skills/` — Bundled skills (50+)
- `apps/macos/` — macOS companion app (SwiftUI menu bar)
- `docs/` — Documentation (Mintlify-hosted)
- `test/` — Global test setup and helpers
- `config/` — Cullmate default config (`cullmate-defaults.json`)

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
- Product name: **Cullmate** (PascalCase) in docs/headings; `cullmate` (lowercase) for CLI/package/config.
- Internal TS types still use `OpenClaw` prefix (e.g. `OpenClawConfig`) — TODO(rename) for future cleanup.

## Plugin/Extension Rules

- Plugin deps go in the extension's own `package.json`, not root.
- Avoid `workspace:*` in plugin `dependencies` (breaks npm install). Use `devDependencies` or `peerDependencies` for `cullmate`.
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
- Config defaults for Cullmate are in `config/cullmate-defaults.json` — keeps remote features disabled by default.
- See `PRODUCT_CONSTRAINTS.md` for the Frictionless Contract that every release must satisfy.
