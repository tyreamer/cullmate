# Release Checklist

Before every BaxBot release, verify each item:

- [ ] App launches and operates fully offline (no network connection)
- [ ] No API keys or accounts required for core functionality
- [ ] No terminal interaction required for install or operation
- [ ] Credits visible in About screen
- [ ] MIT license and THIRD_PARTY_NOTICES.md bundled in distribution
- [ ] No telemetry or diagnostic data sent
- [ ] No remote fetches at startup (update checks, skill registry, etc.)
- [ ] Default config is non-destructive (read-only or copy-on-write for photos)
- [ ] No remote skill installs enabled
- [ ] `pnpm check && pnpm build` passes
- [ ] `pnpm test:fast` passes
