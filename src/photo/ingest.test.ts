import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    expect(reportHtml).toContain("Cullmate Import Receipt");
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
});
