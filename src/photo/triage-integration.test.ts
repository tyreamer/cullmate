import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IngestProgressEvent } from "./types.js";
import { runIngest } from "./ingest.js";

describe("triage integration", () => {
  let tmpDir: string;
  let sourceDir: string;
  let destDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baxbot-triage-int-"));
    sourceDir = path.join(tmpDir, "source");
    destDir = path.join(tmpDir, "output");

    await fs.mkdir(path.join(sourceDir, "day1"), { recursive: true });

    // 3 valid JPEG files
    for (let i = 1; i <= 3; i++) {
      const buf = await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: 100 + i * 20, g: 100 + i * 20, b: 100 + i * 20 },
        },
      })
        .jpeg()
        .toBuffer();
      await fs.writeFile(path.join(sourceDir, "day1", `IMG_00${i}.jpg`), buf);
    }

    // 1 corrupt file (jpg extension, random bytes)
    await fs.writeFile(
      path.join(sourceDir, "day1", "CORRUPT.jpg"),
      Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
    );

    // 1 all-black JPEG
    const blackBuf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(path.join(sourceDir, "day1", "BLACK.jpg"), blackBuf);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("triage artifacts are written after ingest", async () => {
    await runIngest({
      source_path: sourceDir,
      dest_project_path: destDir,
      project_name: "TriageArtifact",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    const cullmateDir = path.join(destDir, "TriageArtifact", ".cullmate");

    // triage.json exists
    const manifests = await fs.readdir(path.join(cullmateDir, "manifests"));
    const triageJson = manifests.find((f) => f.endsWith("_triage.json"));
    expect(triageJson).toBeTruthy();

    // Validate the triage JSON
    const triageData = JSON.parse(
      await fs.readFile(path.join(cullmateDir, "manifests", triageJson!), "utf-8"),
    );
    expect(triageData.version).toBe(1);
    expect(triageData.file_count).toBe(5);

    // triage.csv exists
    const reports = await fs.readdir(path.join(cullmateDir, "reports"));
    const triageCsv = reports.find((f) => f.endsWith("_triage.csv"));
    expect(triageCsv).toBeTruthy();

    // CSV has header
    const csvContent = await fs.readFile(path.join(cullmateDir, "reports", triageCsv!), "utf-8");
    expect(csvContent).toContain("file,flag,confidence,reason,metric");
  });

  it("unreadable file sets safe_to_format=false even without backup", async () => {
    const freshDest = path.join(tmpDir, "output-unreadable-nobackup");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "UnreadableNoBackup",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    // safe_to_format should be false (both because no backup AND unreadable)
    expect(manifest.safe_to_format).toBe(false);
    expect(manifest.totals.triage_unreadable_count).toBeGreaterThan(0);
  });

  it("unreadable file sets safe_to_format=false even with backup", async () => {
    const freshDest = path.join(tmpDir, "output-unreadable-backup");
    const backupDest = path.join(tmpDir, "backup-unreadable");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "UnreadableBackup",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      backup_dest: backupDest,
    });

    // Even with backup, unreadable files prevent safe_to_format
    expect(manifest.safe_to_format).toBe(false);
    expect(manifest.totals.triage_unreadable_count).toBeGreaterThan(0);
  });

  it("black frames do NOT affect safe_to_format", async () => {
    // Create a source with only valid + black-frame files (no corrupt)
    const cleanSource = path.join(tmpDir, "source-clean-with-black");
    await fs.mkdir(cleanSource, { recursive: true });

    // Valid JPEG
    const validBuf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(path.join(cleanSource, "valid.jpg"), validBuf);

    // Black JPEG
    const blackBuf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(path.join(cleanSource, "black.jpg"), blackBuf);

    const freshDest = path.join(tmpDir, "output-black-safe");
    const backupDest = path.join(tmpDir, "backup-black-safe");

    const manifest = await runIngest({
      source_path: cleanSource,
      dest_project_path: freshDest,
      project_name: "BlackSafe",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      backup_dest: backupDest,
    });

    // Black frames exist but safe_to_format is still true (backup present, no unreadables)
    expect(manifest.totals.triage_black_frame_count).toBeGreaterThan(0);
    expect(manifest.totals.triage_unreadable_count).toBe(0);
    expect(manifest.safe_to_format).toBe(true);
  });

  it("triage counts appear in manifest totals", async () => {
    const freshDest = path.join(tmpDir, "output-totals");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "TotalsCounts",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    expect(manifest.totals.triage_unreadable_count).toBeGreaterThan(0);
    expect(manifest.totals.triage_black_frame_count).toBeGreaterThan(0);
    expect(manifest.triage).toBeDefined();
    expect(manifest.triage!.version).toBe(1);
    expect(manifest.triage!.file_count).toBe(5);
  });

  it("report HTML contains triage section when flags exist", async () => {
    const freshDest = path.join(tmpDir, "output-report-triage");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "ReportTriage",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    const reportHtml = await fs.readFile(manifest.report_path!, "utf-8");
    expect(reportHtml).toContain("Unreadable File");
    expect(reportHtml).toContain("Possible Junk Frames");
    expect(reportHtml).toContain("CORRUPT.jpg");
  });

  it("clean ingest produces triage with zero flags", async () => {
    // Source with only valid files
    const cleanSource = path.join(tmpDir, "source-clean");
    await fs.mkdir(cleanSource, { recursive: true });

    const buf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(path.join(cleanSource, "good1.jpg"), buf);
    await fs.writeFile(path.join(cleanSource, "good2.jpg"), buf);

    const freshDest = path.join(tmpDir, "output-clean-triage");

    const manifest = await runIngest({
      source_path: cleanSource,
      dest_project_path: freshDest,
      project_name: "CleanTriage",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    expect(manifest.triage).toBeDefined();
    expect(manifest.triage!.unreadable_count).toBe(0);
    expect(manifest.triage!.black_frame_count).toBe(0);
    expect(manifest.triage!.flagged_files).toHaveLength(0);
    expect(manifest.totals.triage_unreadable_count).toBe(0);
    expect(manifest.totals.triage_black_frame_count).toBe(0);
  });

  it("emits triage progress events", async () => {
    const freshDest = path.join(tmpDir, "output-triage-events");
    const events: IngestProgressEvent[] = [];

    await runIngest(
      {
        source_path: sourceDir,
        dest_project_path: freshDest,
        project_name: "TriageEvents",
        verify_mode: "none",
        overwrite: false,
        hash_algo: "sha256",
      },
      (event) => events.push(event),
    );

    const triageProgress = events.filter((e) => e.type === "ingest.triage.progress");
    expect(triageProgress.length).toBeGreaterThanOrEqual(1);

    const triageDone = events.filter((e) => e.type === "ingest.triage.done");
    expect(triageDone).toHaveLength(1);
  });
});
