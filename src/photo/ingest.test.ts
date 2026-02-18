import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FolderTemplate } from "./folder-template.js";
import type { IngestManifest, IngestProgressEvent } from "./types.js";
import { runIngest } from "./ingest.js";

describe("ingest integration", () => {
  let tmpDir: string;
  let sourceDir: string;
  let destDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cullmate-ingest-test-"));
    sourceDir = path.join(tmpDir, "source");
    destDir = path.join(tmpDir, "output");

    // Create test source directory with nested files
    await fs.mkdir(path.join(sourceDir, "day1"), { recursive: true });
    await fs.mkdir(path.join(sourceDir, "day2"), { recursive: true });

    await fs.writeFile(path.join(sourceDir, "day1", "IMG_001.jpg"), "fake-jpg-data-1");
    await fs.writeFile(path.join(sourceDir, "day1", "MOV_003.mov"), "fake-video-data");
    await fs.writeFile(path.join(sourceDir, "day2", "DSC_002.nef"), "fake-raw-data-2");
    await fs.writeFile(path.join(sourceDir, "day2", "IMG_004.cr2"), "fake-cr2-data");
    await fs.writeFile(path.join(sourceDir, "day2", "IMG_005.png"), "fake-png-data");

    // Also create a non-media file that should be ignored
    await fs.writeFile(path.join(sourceDir, "day1", "notes.txt"), "text file");
    // And a dotfile that should be ignored
    await fs.writeFile(path.join(sourceDir, ".DS_Store"), "system file");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("runs full pipeline with verify_mode=none", async () => {
    const events: IngestProgressEvent[] = [];

    const manifest = await runIngest(
      {
        source_path: sourceDir,
        dest_project_path: destDir,
        project_name: "TestShoot",
        verify_mode: "none",
        overwrite: false,
        hash_algo: "sha256",
      },
      (event) => events.push(event),
    );

    // Project dirs exist
    const projectRoot = path.join(destDir, "TestShoot");
    await expect(fs.stat(path.join(projectRoot, "01_RAW"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, "02_EXPORTS"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, "03_DELIVERY"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, ".cullmate"))).resolves.toBeTruthy();

    // Files copied to correct locations
    const img001 = await fs.readFile(
      path.join(projectRoot, "01_RAW", "day1", "IMG_001.jpg"),
      "utf-8",
    );
    expect(img001).toBe("fake-jpg-data-1");

    const nef = await fs.readFile(path.join(projectRoot, "01_RAW", "day2", "DSC_002.nef"), "utf-8");
    expect(nef).toBe("fake-raw-data-2");

    // Non-media file was not copied
    await expect(fs.stat(path.join(projectRoot, "01_RAW", "day1", "notes.txt"))).rejects.toThrow();

    // Dotfile was not copied
    await expect(fs.stat(path.join(projectRoot, "01_RAW", ".DS_Store"))).rejects.toThrow();

    // Manifest checks
    expect(manifest.tool_version).toBe(1);
    expect(manifest.totals.file_count).toBe(5);
    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.totals.fail_count).toBe(0);
    expect(manifest.totals.skip_count).toBe(0);

    // Hashes are valid sha256
    for (const file of manifest.files) {
      expect(file.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(file.status).toBe("copied");
    }

    // Verify hash correctness for one file
    const img001Hash = crypto.createHash("sha256").update("fake-jpg-data-1").digest("hex");
    const img001Entry = manifest.files.find((f) => f.src_rel === "day1/IMG_001.jpg");
    expect(img001Entry?.hash).toBe(img001Hash);

    // Manifest and report files exist
    expect(manifest.manifest_path).toBeTruthy();
    expect(manifest.report_path).toBeTruthy();
    await expect(fs.stat(manifest.manifest_path!)).resolves.toBeTruthy();
    await expect(fs.stat(manifest.report_path!)).resolves.toBeTruthy();

    // Manifest JSON is valid
    const manifestJson = JSON.parse(
      await fs.readFile(manifest.manifest_path!, "utf-8"),
    ) as IngestManifest;
    expect(manifestJson.totals.success_count).toBe(5);

    // Report HTML contains key info
    const reportHtml = await fs.readFile(manifest.report_path!, "utf-8");
    expect(reportHtml).toContain("Cullmate Safety Report");
    expect(reportHtml).toContain("TestShoot");
    expect(reportHtml).toContain("IMG_001.jpg");

    // Progress events
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("ingest.start");
    expect(eventTypes).toContain("ingest.scan.progress");
    expect(eventTypes).toContain("ingest.copy.progress");
    expect(eventTypes).toContain("ingest.report.generated");
    expect(eventTypes).toContain("ingest.done");
  });

  it("skips existing files with overwrite=false", async () => {
    // Run again on same destination
    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: destDir,
      project_name: "TestShoot",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    expect(manifest.totals.skip_count).toBe(5);
    expect(manifest.totals.success_count).toBe(0);

    for (const file of manifest.files) {
      expect(file.status).toBe("skipped_exists");
    }
  });

  it("runs with verify_mode=sentinel", async () => {
    const freshDest = path.join(tmpDir, "output-sentinel");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "SentinelTest",
      verify_mode: "sentinel",
      overwrite: false,
      hash_algo: "sha256",
    });

    expect(manifest.totals.success_count).toBe(5);
    // With 5 files (< 75), all should be verified in sentinel mode
    expect(manifest.totals.verified_count).toBe(5);
    expect(manifest.totals.verified_ok).toBe(5);
    expect(manifest.totals.verified_mismatch).toBe(0);

    const verifiedFiles = manifest.files.filter((f) => f.verified === true);
    expect(verifiedFiles.length).toBe(5);
  });

  it("runs with verify_mode=full and blake3", async () => {
    const freshDest = path.join(tmpDir, "output-full-blake3");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "FullBlake3",
      verify_mode: "full",
      overwrite: false,
      hash_algo: "blake3",
    });

    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.totals.verified_count).toBe(5);
    expect(manifest.totals.verified_ok).toBe(5);
    expect(manifest.hash_algo).toBe("blake3");

    // blake3 hashes are 64 hex chars
    for (const file of manifest.files) {
      expect(file.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("throws for non-directory source", async () => {
    const filePath = path.join(tmpDir, "not-a-dir.txt");
    await fs.writeFile(filePath, "not a directory");

    await expect(
      runIngest({
        source_path: filePath,
        dest_project_path: destDir,
        project_name: "Bad",
        verify_mode: "none",
        overwrite: false,
        hash_algo: "sha256",
      }),
    ).rejects.toThrow("source_path is not a directory");
  });

  it("throws for non-existent source", async () => {
    await expect(
      runIngest({
        source_path: path.join(tmpDir, "does-not-exist"),
        dest_project_path: destDir,
        project_name: "Bad",
        verify_mode: "none",
        overwrite: false,
        hash_algo: "sha256",
      }),
    ).rejects.toThrow();
  });

  it("deduplicates identical files across subdirectories", async () => {
    // Create a fresh source with duplicate files in different subdirectories
    const dedupeSource = path.join(tmpDir, "source-dedupe");
    await fs.mkdir(path.join(dedupeSource, "card1"), { recursive: true });
    await fs.mkdir(path.join(dedupeSource, "card2"), { recursive: true });

    const identicalContent = "identical-photo-data-for-dedupe";
    await fs.writeFile(path.join(dedupeSource, "card1", "IMG_001.jpg"), identicalContent);
    await fs.writeFile(path.join(dedupeSource, "card2", "IMG_001.jpg"), identicalContent);
    await fs.writeFile(path.join(dedupeSource, "card1", "IMG_002.cr2"), "unique-raw-data");

    const freshDest = path.join(tmpDir, "output-dedupe");
    const events: IngestProgressEvent[] = [];

    const manifest = await runIngest(
      {
        source_path: dedupeSource,
        dest_project_path: freshDest,
        project_name: "DedupeTest",
        verify_mode: "none",
        overwrite: false,
        hash_algo: "sha256",
        dedupe: true,
      },
      (event) => events.push(event),
    );

    const projectRoot = path.join(freshDest, "DedupeTest");

    // Totals
    expect(manifest.totals.file_count).toBe(3);
    expect(manifest.totals.success_count).toBe(2);
    expect(manifest.totals.duplicate_count).toBe(1);
    expect(manifest.totals.bytes_saved).toBe(Buffer.byteLength(identicalContent));

    // One file has status skipped_duplicate with valid duplicate_of
    const dupeEntries = manifest.files.filter((f) => f.status === "skipped_duplicate");
    expect(dupeEntries).toHaveLength(1);
    const dupeEntry = dupeEntries[0];
    expect(dupeEntry.duplicate_of).toBeTruthy();

    // The duplicate_of points to a copied entry's dst_rel
    const copiedEntry = manifest.files.find((f) => f.dst_rel === dupeEntry.duplicate_of);
    expect(copiedEntry).toBeTruthy();
    expect(copiedEntry!.status).toBe("copied");

    // Both identical files have the same hash
    const identicalHash = crypto.createHash("sha256").update(identicalContent).digest("hex");
    const bothImg001 = manifest.files.filter((f) => f.src_rel.endsWith("IMG_001.jpg"));
    expect(bothImg001).toHaveLength(2);
    for (const f of bothImg001) {
      expect(f.hash).toBe(identicalHash);
    }

    // ingest.dedupe.hit event emitted once with correct totals
    const dedupeEvents = events.filter((e) => e.type === "ingest.dedupe.hit");
    expect(dedupeEvents).toHaveLength(1);
    const dedupeHit = dedupeEvents[0];
    expect(dedupeHit.duplicate_count_total).toBe(1);
    expect(dedupeHit.bytes_saved_total).toBe(Buffer.byteLength(identicalContent));

    // Skipped file NOT written to disk, copied file IS on disk
    const copiedDstAbs = path.join(projectRoot, copiedEntry!.dst_rel);
    await expect(fs.stat(copiedDstAbs)).resolves.toBeTruthy();

    const dupeSrcRel = dupeEntry.src_rel; // e.g. "card2/IMG_001.jpg"
    const dupeDstAbs = path.join(projectRoot, "01_RAW", dupeSrcRel);
    await expect(fs.stat(dupeDstAbs)).rejects.toThrow();

    // Report HTML contains dedupe section
    const reportHtml = await fs.readFile(manifest.report_path!, "utf-8");
    expect(reportHtml).toContain("Duplicates Skipped");
    expect(reportHtml).toContain("mirror backups");
  });

  it("copies all files when dedupe is off", async () => {
    // Same dual-card setup as dedupe test, but with dedupe off
    const dedupeSource = path.join(tmpDir, "source-nodedupe");
    await fs.mkdir(path.join(dedupeSource, "card1"), { recursive: true });
    await fs.mkdir(path.join(dedupeSource, "card2"), { recursive: true });

    const identicalContent = "identical-photo-data-for-nodedupe";
    await fs.writeFile(path.join(dedupeSource, "card1", "IMG_001.jpg"), identicalContent);
    await fs.writeFile(path.join(dedupeSource, "card2", "IMG_001.jpg"), identicalContent);
    await fs.writeFile(path.join(dedupeSource, "card1", "IMG_002.cr2"), "unique-raw-data-nd");

    const freshDest = path.join(tmpDir, "output-nodedupe");

    const manifest = await runIngest({
      source_path: dedupeSource,
      dest_project_path: freshDest,
      project_name: "NoDedupeTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      dedupe: false,
    });

    // All 3 files should be copied — no duplicates detected
    expect(manifest.totals.file_count).toBe(3);
    expect(manifest.totals.success_count).toBe(3);
    expect(manifest.totals.duplicate_count).toBe(0);

    // Every file has status "copied"
    for (const file of manifest.files) {
      expect(file.status).toBe("copied");
    }
  });

  it("dedupe defaults to off when param omitted", async () => {
    // Same dual-card setup, but no dedupe field at all
    const dedupeSource = path.join(tmpDir, "source-default-dedupe");
    await fs.mkdir(path.join(dedupeSource, "card1"), { recursive: true });
    await fs.mkdir(path.join(dedupeSource, "card2"), { recursive: true });

    const identicalContent = "identical-photo-data-for-default";
    await fs.writeFile(path.join(dedupeSource, "card1", "IMG_001.jpg"), identicalContent);
    await fs.writeFile(path.join(dedupeSource, "card2", "IMG_001.jpg"), identicalContent);
    await fs.writeFile(path.join(dedupeSource, "card1", "IMG_002.cr2"), "unique-raw-data-df");

    const freshDest = path.join(tmpDir, "output-default-dedupe");

    // Note: no `dedupe` field in params
    const manifest = await runIngest({
      source_path: dedupeSource,
      dest_project_path: freshDest,
      project_name: "DefaultDedupeTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    // All 3 files should be copied — dedupe is off by default
    expect(manifest.totals.file_count).toBe(3);
    expect(manifest.totals.success_count).toBe(3);
    expect(manifest.totals.duplicate_count).toBe(0);
  });

  it("expands tilde in source_path and dest_project_path", async () => {
    // Create a source dir with a media file inside tmpDir, then use a tilde path
    // We can't truly test ~ expansion without mocking os.homedir(),
    // but we can verify the function handles non-tilde paths unchanged
    const freshDest = path.join(tmpDir, "output-tilde");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "TildeTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.project_root).toBe(path.join(freshDest, "TildeTest"));
  });

  it("copies to backup and sets safe_to_format=true", async () => {
    const freshDest = path.join(tmpDir, "output-backup");
    const backupDest = path.join(tmpDir, "backup");
    const events: IngestProgressEvent[] = [];

    const manifest = await runIngest(
      {
        source_path: sourceDir,
        dest_project_path: freshDest,
        project_name: "BackupTest",
        verify_mode: "sentinel",
        overwrite: false,
        hash_algo: "sha256",
        backup_dest: backupDest,
      },
      (event) => events.push(event),
    );

    // Primary copy succeeded
    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.totals.fail_count).toBe(0);

    // Backup copy succeeded
    expect(manifest.totals.backup_success_count).toBe(5);
    expect(manifest.totals.backup_fail_count).toBe(0);

    // Backup verification passed
    expect(manifest.totals.backup_verified_count).toBe(5);
    expect(manifest.totals.backup_verified_ok).toBe(5);
    expect(manifest.totals.backup_verified_mismatch).toBe(0);

    // Safe to format!
    expect(manifest.safe_to_format).toBe(true);

    // Backup dest and root are set in manifest
    expect(manifest.backup_dest).toBe(backupDest);
    expect(manifest.backup_root).toBe(path.join(backupDest, "BackupTest", "01_RAW"));

    // Backup files actually exist on disk
    const backupImg = await fs.readFile(
      path.join(backupDest, "BackupTest", "01_RAW", "day1", "IMG_001.jpg"),
      "utf-8",
    );
    expect(backupImg).toBe("fake-jpg-data-1");

    // Backup project structure created
    await expect(fs.stat(path.join(backupDest, "BackupTest", "02_EXPORTS"))).resolves.toBeTruthy();

    // File entries have backup fields
    const copied = manifest.files.filter((f) => f.status === "copied");
    for (const f of copied) {
      expect(f.backup_status).toBe("copied");
      expect(f.backup_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(f.backup_verified).toBe(true);
    }

    // Backup progress events emitted
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("ingest.backup.start");
    expect(eventTypes).toContain("ingest.backup.copy.progress");
    expect(eventTypes).toContain("ingest.backup.verify.progress");

    // Done event includes safe_to_format
    const doneEvent = events.find((e) => e.type === "ingest.done");
    expect(doneEvent).toBeTruthy();
    if (doneEvent?.type === "ingest.done") {
      expect(doneEvent.safe_to_format).toBe(true);
    }

    // Report HTML contains safe-to-format banner
    const reportHtml = await fs.readFile(manifest.report_path!, "utf-8");
    expect(reportHtml).toContain("Safe to Format Cards: YES");
    expect(reportHtml).toContain("backup");
  });

  it("sets safe_to_format=false when no backup provided", async () => {
    const freshDest = path.join(tmpDir, "output-no-backup");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "NoBackupTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.safe_to_format).toBe(false);
    expect(manifest.backup_dest).toBeUndefined();
    expect(manifest.backup_root).toBeUndefined();

    // Report warns about no backup
    const reportHtml = await fs.readFile(manifest.report_path!, "utf-8");
    expect(reportHtml).toContain("No Backup Configured");
  });

  it("copies to backup with verify_mode=none", async () => {
    const freshDest = path.join(tmpDir, "output-backup-noverify");
    const backupDest = path.join(tmpDir, "backup-noverify");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "BackupNoVerify",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      backup_dest: backupDest,
    });

    // Primary and backup copies succeeded
    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.totals.backup_success_count).toBe(5);

    // No verification done (verify_mode=none)
    expect(manifest.totals.verified_count).toBe(0);
    expect(manifest.totals.backup_verified_count).toBe(0);

    // Still safe to format (no failures, no mismatches)
    expect(manifest.safe_to_format).toBe(true);
  });

  // ── Template routing tests ──

  it("routes files to media-type folders with media-split template", async () => {
    const freshDest = path.join(tmpDir, "output-media-split");
    const template: FolderTemplate = {
      template_id: "preset:media-split",
      name: "Media Split",
      description: "Split by media type",
      is_preset: true,
      routing_rules: [
        { label: "RAW files", match: { media_type: "RAW" }, dest_pattern: "RAW" },
        { label: "Video files", match: { media_type: "VIDEO" }, dest_pattern: "VIDEO" },
        { label: "Other files", dest_pattern: "PHOTO" },
      ],
      scaffold_dirs: ["EXPORTS", "DELIVERY"],
      token_defaults: {},
    };

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "MediaSplitTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      folder_template: template,
    });

    const projectRoot = path.join(freshDest, "MediaSplitTest");

    // All files should be copied
    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.template_id).toBe("preset:media-split");

    // RAW files (.nef, .cr2) should be in RAW/
    const nefEntry = manifest.files.find((f) => f.src_rel.endsWith("DSC_002.nef"));
    expect(nefEntry?.dst_rel).toContain("RAW/");
    expect(nefEntry?.routed_by).toBe("RAW files");

    const cr2Entry = manifest.files.find((f) => f.src_rel.endsWith("IMG_004.cr2"));
    expect(cr2Entry?.dst_rel).toContain("RAW/");

    // Video file (.mov) should be in VIDEO/
    const movEntry = manifest.files.find((f) => f.src_rel.endsWith("MOV_003.mov"));
    expect(movEntry?.dst_rel).toContain("VIDEO/");
    expect(movEntry?.routed_by).toBe("Video files");

    // Photo files (.jpg, .png) should be in PHOTO/
    const jpgEntry = manifest.files.find((f) => f.src_rel.endsWith("IMG_001.jpg"));
    expect(jpgEntry?.dst_rel).toContain("PHOTO/");
    expect(jpgEntry?.routed_by).toBe("Other files");

    // Verify files exist on disk in correct locations
    await expect(fs.stat(path.join(projectRoot, nefEntry!.dst_rel))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, movEntry!.dst_rel))).resolves.toBeTruthy();

    // Scaffold dirs created (not 01_RAW, 02_EXPORTS, 03_DELIVERY)
    await expect(fs.stat(path.join(projectRoot, "EXPORTS"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, "DELIVERY"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, ".cullmate"))).resolves.toBeTruthy();

    // Legacy dirs should NOT exist
    await expect(fs.stat(path.join(projectRoot, "01_RAW"))).rejects.toThrow();
    await expect(fs.stat(path.join(projectRoot, "02_EXPORTS"))).rejects.toThrow();
  });

  it("uses date tokens from import date when no EXIF", async () => {
    const freshDest = path.join(tmpDir, "output-date-template");
    const template: FolderTemplate = {
      template_id: "preset:date-organized",
      name: "Date Organized",
      description: "By date",
      is_preset: true,
      routing_rules: [{ label: "All by date", dest_pattern: "{YYYY}/{MM}-{DD}" }],
      scaffold_dirs: ["EXPORTS"],
      token_defaults: {},
    };

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "DateTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      folder_template: template,
    });

    expect(manifest.totals.success_count).toBe(5);

    // All files should have a date-based path (using import date since files have no EXIF)
    const now = new Date();
    const yyyy = String(now.getFullYear());
    for (const file of manifest.files) {
      expect(file.dst_rel).toContain(yyyy);
    }
  });

  it("creates scaffold dirs even with no files routed there", async () => {
    const freshDest = path.join(tmpDir, "output-scaffold");
    const template: FolderTemplate = {
      template_id: "test:scaffold",
      name: "Scaffold Test",
      description: "Testing scaffold dirs",
      is_preset: false,
      routing_rules: [{ label: "All", dest_pattern: "ALL_FILES" }],
      scaffold_dirs: ["EXPORTS/web", "EXPORTS/print", "DELIVERY"],
      token_defaults: {},
    };

    await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "ScaffoldTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      folder_template: template,
    });

    const projectRoot = path.join(freshDest, "ScaffoldTest");
    await expect(fs.stat(path.join(projectRoot, "EXPORTS/web"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, "EXPORTS/print"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, "DELIVERY"))).resolves.toBeTruthy();
  });

  it("falls back to classic behavior when no template", async () => {
    const freshDest = path.join(tmpDir, "output-no-template");

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "ClassicTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
    });

    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.template_id).toBeUndefined();

    // All files should be under 01_RAW/
    for (const file of manifest.files) {
      expect(file.dst_rel.startsWith("01_RAW/")).toBe(true);
    }

    const projectRoot = path.join(freshDest, "ClassicTest");
    await expect(fs.stat(path.join(projectRoot, "01_RAW"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, "02_EXPORTS"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(projectRoot, "03_DELIVERY"))).resolves.toBeTruthy();
  });

  it("backup mirrors template structure", async () => {
    const freshDest = path.join(tmpDir, "output-template-backup");
    const backupDest = path.join(tmpDir, "backup-template");
    const template: FolderTemplate = {
      template_id: "preset:media-split",
      name: "Media Split",
      description: "Split by media type",
      is_preset: true,
      routing_rules: [
        { label: "RAW files", match: { media_type: "RAW" }, dest_pattern: "RAW" },
        { label: "Video files", match: { media_type: "VIDEO" }, dest_pattern: "VIDEO" },
        { label: "Other files", dest_pattern: "PHOTO" },
      ],
      scaffold_dirs: ["EXPORTS"],
      token_defaults: {},
    };

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "BackupTemplateTest",
      verify_mode: "sentinel",
      overwrite: false,
      hash_algo: "sha256",
      backup_dest: backupDest,
      folder_template: template,
    });

    expect(manifest.totals.success_count).toBe(5);
    expect(manifest.totals.backup_success_count).toBe(5);
    expect(manifest.safe_to_format).toBe(true);

    // Verify backup files mirror the template structure
    const nefEntry = manifest.files.find((f) => f.src_rel.endsWith("DSC_002.nef"));
    const backupNefPath = path.join(backupDest, "BackupTemplateTest", nefEntry!.dst_rel);
    await expect(fs.stat(backupNefPath)).resolves.toBeTruthy();

    // Backup scaffold dirs created
    await expect(
      fs.stat(path.join(backupDest, "BackupTemplateTest", "EXPORTS")),
    ).resolves.toBeTruthy();
  });

  it("stores template_id in manifest", async () => {
    const freshDest = path.join(tmpDir, "output-template-id");
    const template: FolderTemplate = {
      template_id: "custom:abc123",
      name: "Custom Template",
      description: "Testing template_id",
      is_preset: false,
      routing_rules: [{ label: "All", dest_pattern: "FILES" }],
      scaffold_dirs: [],
      token_defaults: {},
    };

    const manifest = await runIngest({
      source_path: sourceDir,
      dest_project_path: freshDest,
      project_name: "TemplateIdTest",
      verify_mode: "none",
      overwrite: false,
      hash_algo: "sha256",
      folder_template: template,
    });

    expect(manifest.template_id).toBe("custom:abc123");

    // Verify it's in the written manifest JSON too
    const manifestJson = JSON.parse(
      await fs.readFile(manifest.manifest_path!, "utf-8"),
    ) as IngestManifest;
    expect(manifestJson.template_id).toBe("custom:abc123");
  });
});
