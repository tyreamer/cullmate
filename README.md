# BaxBot — Studio Manager for Photographers

<p align="center">
  <img src="ui/public/logo.png" alt="BaxBot" width="120">
</p>

<p align="center">
  <strong>From camera to client, without the chaos.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <a href="https://github.com/tyreamer/cullmate"><img src="https://img.shields.io/badge/platform-macOS-lightgrey?style=for-the-badge&logo=apple" alt="macOS"></a>
</p>

---

## What is BaxBot?

BaxBot is a **local-first studio manager** for wedding and portrait photographers. It handles everything around the edit — from camera card to safe storage to edit handoff (Lightroom / Capture One) to post-edit packaging and marketing — so you can focus on shooting and editing.

The real bottleneck for photographers isn't applying presets. It's the massive data ingest, culling, and metadata tagging that eats hours of every shoot. BaxBot automates that entire pipeline: drop a folder of assets, and intelligent agents do the heavy lifting.

**No internet required. No accounts. No terminal. Just plug in your card.**

### The Problem

After every shoot, photographers face the same grind:

1. Manually copy thousands of files from cards to drives (and pray nothing corrupts)
2. Create backup copies and somehow verify they're identical
3. Organize files into project folders by hand
4. Tag metadata (copyright, creator, studio info) one batch at a time
5. Cull through hundreds of out-of-focus, black-frame, and misfire shots
6. Prep deliverables for clients, vendors, blogs, and albums

This takes **hours per shoot** — time that doesn't generate revenue. One corrupted card or missed backup can mean losing an entire wedding day.

### The Solution

BaxBot replaces that entire workflow with a single drag-and-drop pipeline:

```
SD Card → BaxBot → Verified Project → Ready for Editing
```

Plug in your camera card. BaxBot detects it, copies every file with cryptographic verification, creates a verified backup, organizes everything into your preferred folder structure, stamps your copyright metadata, and gives you a clear **Safe to Format** verdict — all before you open Lightroom.

---

## Features

### Phase 1 — Safety Appliance (Complete)

Your photos are irreplaceable. BaxBot treats them that way.

- **Verified two-copy ingest** — Every file is hashed (SHA-256/BLAKE3) during copy and verified after. Bit-for-bit proof that your copies are identical to the originals.
- **Automatic backup** — Simultaneous copy to a second drive. Both copies independently verified.
- **Safe-to-format verdict** — A clear YES/NO answer: "Is it safe to format this card?" Only YES when both copies are verified with zero failures.
- **HTML Safety Report** — A human-readable receipt for every ingest with file counts, hash results, and timestamps. Keep it with the project forever.
- **JSON manifest** — Machine-readable record of every file, hash, and copy operation for archival and automation.
- **Smart deduplication** — Optional pre-hash dedup for dual-card shooters. Skip identical files across card slots without missing anything.
- **Camera card detection** — macOS menu bar app detects SD/CF cards the moment they mount and prompts you to ingest.
- **Crash-safe copies** — Atomic file operations ensure a power failure mid-copy can't corrupt your destination.

### Phase 1.5 — Structure (Complete)

Get organized automatically, your way.

- **5 built-in folder templates** — Classic, Date Organized, Media Split, Camera + Date, Wedding Pro. Or build your own.
- **12 expansion tokens** — `{YYYY}`, `{MM}`, `{DD}`, `{CLIENT}`, `{JOB}`, `{MEDIA_TYPE}`, `{CAMERA_MODEL}`, and more. Folders name themselves from EXIF data.
- **Smart routing rules** — Route RAW files to one folder, video to another, JPEGs to a third — automatically by media type or extension.
- **XMP sidecar writing** — Automatically stamps creator, copyright, and credit metadata as .xmp sidecars next to every file. Your name is on your work from the start.
- **Studio Profile** — Set up your name, studio, website, and copyright line once. It flows into every ingest automatically.
- **AI-powered template generation** — Describe your folder structure in plain English, and BaxBot generates the template. (Developer mode, powered by local Ollama.)

### macOS Companion App

- **Menu bar app** — Always-on gateway control, health monitoring, one-click ingest.
- **Card detection notifications** — "EOS R5 detected — Import & Verify?" with one-click action.
- **Studio Manager UI** — Conversation-driven timeline interface. No menus to learn. The app tells you what to do next.

---

## Target Market

BaxBot is built for **working photographers** who shoot high volume:

- **Wedding photographers** — 3,000-8,000 images per event across multiple cards and camera bodies. One corrupted backup can mean losing the most important day of someone's life.
- **Portrait and family photographers** — Consistent high-volume output with repeat clients who expect fast turnaround.
- **Event photographers** — Conferences, galas, sports — fast ingest between sessions with verified backups.
- **Medium format and film scan shooters** — 100MB+ files per frame. BaxBot handles large files natively with streaming hashes.
- **Multi-shooter studios** — Standardized folder structures and metadata across an entire team.

**The common thread:** photographers who are done gambling with manual file copies and want verified, automated ingest they can trust with irreplaceable work.

---

## Roadmap

### Phase 2 — Technical Triage (Next)

AI-powered culling to eliminate the hours spent reviewing thousands of frames.

- **Corruption / readability check** — Validate file format integrity beyond hash matching. Catch truncated writes and card errors before you format.
- **Black frame / lens cap detection** — Computer vision to automatically flag misfires, lens caps, and accidental shutter presses.
- **Sharpness scoring** — Per-image focus quality analysis. Surface the sharp shots, flag the soft ones.
- **Eye-open detection** — Automatically identify closed-eye shots in portraits and group photos.
- **Exposure analysis** — Flag blown highlights and crushed shadows before you open the editor.
- **Burst grouping** — Cluster rapid-fire sequences and surface the best frame from each burst.
- **Time sync (OCR time lord)** — Cross-camera time synchronization using visual timecode references.

### Phase 3 — Business Engine

Turn your shoot into marketing assets automatically.

- **Vendor prep engine** — Auto-generate vendor submission packages with proper credits and formatting.
- **SEO + blogging prep** — Generate blog-ready image sets with SEO filenames and alt text.
- **Hero picks for sneak peeks** — AI-selected highlight images for same-day social media posts.

### Phase 4 — Post-Edit Delivery & Packaging

From final edit to client delivery in one click.

- **Export preset library** — Web, Print, Social, Vendor, Album, Blog — all the renditions you need.
- **Multi-rendition export** — Generate all delivery formats from a single set of edited files.
- **Watermark rules** — Automatic watermarking by delivery type (proofs vs. finals vs. social).
- **Privacy scrubbing** — Strip GPS and sensitive EXIF data from client deliverables.
- **Delivery package builder** — ZIP packages with proper folder structure, ready for download links.
- **Client delivery checklist** — Never forget a deliverable. Automated tracking of what's been sent.
- **Vendor sharing packages** — Formatted sets for venues, planners, and other vendors.
- **Blog set builder** — SEO-optimized filenames and sizing for blog posts.
- **Album select workflow** — Streamlined album layout selection with client review.
- **Archive lifecycle (3-2-1 backup)** — Automated archive verification and integrity monitoring.
- **"Publish Wedding" one-button flow** — Blog + vendor packages + client gallery + social sneak peeks, all from one action.

---

## Quick Start

### Requirements

- **macOS** (companion app is macOS-native; CLI works on macOS/Linux)
- **Node.js 22+**
- **pnpm 10+**

### Install & Run

```bash
git clone https://github.com/tyreamer/cullmate.git
cd cullmate

pnpm install
pnpm ui:build
pnpm build

# Start the gateway
pnpm gateway:dev

# Or use the macOS app
bash scripts/package-mac-app.sh
open dist/macos/BaxBot.app
```

### Development

```bash
pnpm gateway:watch     # Auto-reload gateway on code changes
pnpm ui:dev            # Vite dev server for the web UI
pnpm check             # Format + typecheck + lint
pnpm test              # Run all tests
```

---

## Architecture

```
    +-----------------+
    |  macOS Menu Bar  |  BaxBot.app (SwiftUI)
    |  (card detect,   |
    |   one-click      |
    |   ingest)        |
    +--------+---------+
             |
    +--------v---------+
    |     Gateway       |  ws://127.0.0.1:19001
    |  (WebSocket       |  (sessions, presence, cron)
    |   control plane)  |
    +--------+----------+
             |
             +-- Photo Ingest Pipeline (scan -> copy -> verify -> report)
             +-- Studio Manager UI (Lit web components)
             +-- CLI (baxbot ...)
             +-- Agent Runtime (tool streaming)
```

### Core Pipeline

```
Camera Card
    |
    v
  Scan --- Find all media files (RAW, JPEG, Video)
    |
    v
  Copy --- Stream to destination with hash computation
    |
    v
 Verify -- Re-hash and compare (full, sentinel, or skip)
    |
    v
 Backup -- Copy to second drive + independent verify
    |
    v
  XMP ---- Stamp copyright/creator metadata
    |
    v
 Report -- HTML Safety Report + JSON manifest
    |
    v
 Safe to Format? YES / NO
```

---

## Tech Stack

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Runtime   | Node.js 22+, TypeScript (ESM, strict) |
| Build     | tsdown, pnpm 10, Vite                 |
| UI        | Lit web components                    |
| Gateway   | Express + WebSocket                   |
| macOS App | SwiftUI (menu bar)                    |
| Testing   | Vitest (V8 coverage)                  |
| Linting   | Oxlint + Oxfmt                        |
| Schemas   | Zod                                   |

---

## The Frictionless Contract

Every BaxBot release must satisfy these constraints:

1. **No internet needed** — Everything works offline, on your local machine.
2. **No accounts or API keys** — No sign-up, no cloud dependency.
3. **No terminal required** — The macOS app handles everything through the GUI.
4. **Non-destructive defaults** — BaxBot copies; it never moves or deletes originals.
5. **No remote skill installs** — All functionality ships with the app.

---

## Derived From OpenClaw

BaxBot is derived from [OpenClaw](https://github.com/openclaw/openclaw) (MIT License), an open-source personal AI assistant platform. BaxBot strips away the general-purpose assistant features and rebuilds the experience around the specific needs of professional photographers.

---

## License

[MIT](LICENSE)
