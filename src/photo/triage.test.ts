import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FileEntry } from "./types.js";
import { checkBlackFrame, checkCorruption } from "./triage-checks.js";
import { runTriage } from "./triage.js";

describe("triage checks", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baxbot-triage-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Fixtures ──

  async function writeValidJpeg(name: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    const buf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(filePath, buf);
    return filePath;
  }

  async function writeValidPng(name: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    const buf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();
    await fs.writeFile(filePath, buf);
    return filePath;
  }

  async function writeBlackJpeg(name: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    const buf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(filePath, buf);
    return filePath;
  }

  async function writeDimJpeg(name: string, brightness: number): Promise<string> {
    const filePath = path.join(tmpDir, name);
    const buf = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: brightness, g: brightness, b: brightness },
      },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(filePath, buf);
    return filePath;
  }

  async function writeCorruptFile(name: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    // Random bytes that don't match any known format
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);
    await fs.writeFile(filePath, buf);
    return filePath;
  }

  async function writeTruncatedJpeg(name: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    // Valid JPEG SOI marker but nothing else
    const buf = Buffer.from([0xff, 0xd8]);
    await fs.writeFile(filePath, buf);
    return filePath;
  }

  async function writeEmptyFile(name: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.writeFile(filePath, Buffer.alloc(0));
    return filePath;
  }

  // ── checkCorruption ──

  describe("checkCorruption", () => {
    it("returns null for valid JPEG", async () => {
      const filePath = await writeValidJpeg("valid.jpg");
      const result = await checkCorruption(filePath);
      expect(result).toBeNull();
    });

    it("returns null for valid PNG", async () => {
      const filePath = await writeValidPng("valid.png");
      const result = await checkCorruption(filePath);
      expect(result).toBeNull();
    });

    it("flags random bytes as unreadable", async () => {
      const filePath = await writeCorruptFile("corrupt.jpg");
      const result = await checkCorruption(filePath);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("unreadable");
      expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("flags truncated JPEG as unreadable", async () => {
      const filePath = await writeTruncatedJpeg("truncated.jpg");
      const result = await checkCorruption(filePath);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("unreadable");
    });

    it("flags empty file as unreadable", async () => {
      const filePath = await writeEmptyFile("empty.jpg");
      const result = await checkCorruption(filePath);
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("unreadable");
      expect(result!.confidence).toBe(1.0);
    });

    it("flags extension mismatch (jpg extension, png content)", async () => {
      // Write a valid PNG but name it .jpg
      const pngPath = await writeValidPng("mismatch_source.png");
      const jpgPath = path.join(tmpDir, "mismatch.jpg");
      await fs.copyFile(pngPath, jpgPath);

      const result = await checkCorruption(jpgPath);
      // file-type detects image/png for a .jpg extension — Sharp may still decode it
      // but the magic-byte mismatch should be caught
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("unreadable");
      expect(result!.reason).toContain("does not match");
    });

    it("returns null for video files (skips Sharp decode)", async () => {
      // Create a minimal MP4-like file with ftyp box
      const filePath = path.join(tmpDir, "video.mov");
      // Minimal ftyp box header that file-type recognizes
      const ftyp = Buffer.alloc(32);
      ftyp.writeUInt32BE(32, 0); // box size
      ftyp.write("ftyp", 4); // box type
      ftyp.write("qt  ", 8); // major brand
      await fs.writeFile(filePath, ftyp);

      const result = await checkCorruption(filePath);
      // Should not flag as unreadable since we don't Sharp-decode video
      expect(result).toBeNull();
    });
  });

  // ── checkBlackFrame ──

  describe("checkBlackFrame", () => {
    it("flags all-black image", async () => {
      const filePath = await writeBlackJpeg("black.jpg");
      const result = await checkBlackFrame(filePath, "PHOTO");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("black_frame");
      expect(result!.confidence).toBe(0.95);
      expect(result!.metric).toBeDefined();
      expect(result!.metric!).toBeLessThan(5);
    });

    it("does not flag white image", async () => {
      const filePath = await writeValidJpeg("white.jpg"); // gray actually (128,128,128)
      const result = await checkBlackFrame(filePath, "PHOTO");
      expect(result).toBeNull();
    });

    it("does not flag dim-but-not-black image (luminance ~30)", async () => {
      const filePath = await writeDimJpeg("dim.jpg", 30);
      const result = await checkBlackFrame(filePath, "PHOTO");
      expect(result).toBeNull();
    });

    it("flags very dark image with lower confidence", async () => {
      const filePath = await writeDimJpeg("very-dark.jpg", 10);
      const result = await checkBlackFrame(filePath, "PHOTO");
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("black_frame");
      expect(result!.confidence).toBe(0.7);
    });

    it("returns null for video files (skipped)", async () => {
      const filePath = await writeBlackJpeg("video-black.mov");
      const result = await checkBlackFrame(filePath, "VIDEO");
      expect(result).toBeNull();
    });
  });

  // ── runTriage ──

  describe("runTriage", () => {
    it("returns clean result for all-valid files", async () => {
      await writeValidJpeg("triage-valid1.jpg");
      await writeValidPng("triage-valid2.png");
      const projectRoot = tmpDir;

      const files: FileEntry[] = [
        {
          src_rel: "triage-valid1.jpg",
          dst_rel: "triage-valid1.jpg",
          bytes: 100,
          hash: "abc",
          status: "copied",
          media_type: "PHOTO",
        },
        {
          src_rel: "triage-valid2.png",
          dst_rel: "triage-valid2.png",
          bytes: 100,
          hash: "def",
          status: "copied",
          media_type: "PHOTO",
        },
      ];

      const result = await runTriage({ files, projectRoot });
      expect(result.version).toBe(1);
      expect(result.file_count).toBe(2);
      expect(result.unreadable_count).toBe(0);
      expect(result.black_frame_count).toBe(0);
      expect(result.flagged_files).toHaveLength(0);
    });

    it("flags corrupt file in results", async () => {
      await writeCorruptFile("triage-corrupt.jpg");
      const projectRoot = tmpDir;

      const files: FileEntry[] = [
        {
          src_rel: "triage-corrupt.jpg",
          dst_rel: "triage-corrupt.jpg",
          bytes: 10,
          hash: "bad",
          status: "copied",
          media_type: "PHOTO",
        },
      ];

      const result = await runTriage({ files, projectRoot });
      expect(result.unreadable_count).toBe(1);
      expect(result.flagged_files).toHaveLength(1);
      expect(result.flagged_files[0].flags[0].kind).toBe("unreadable");
    });

    it("flags black frame in results", async () => {
      await writeBlackJpeg("triage-black.jpg");
      const projectRoot = tmpDir;

      const files: FileEntry[] = [
        {
          src_rel: "triage-black.jpg",
          dst_rel: "triage-black.jpg",
          bytes: 100,
          hash: "blk",
          status: "copied",
          media_type: "PHOTO",
        },
      ];

      const result = await runTriage({ files, projectRoot });
      expect(result.black_frame_count).toBe(1);
      expect(result.flagged_files).toHaveLength(1);
      expect(result.flagged_files[0].flags[0].kind).toBe("black_frame");
    });

    it("skips non-copied files (errors, duplicates)", async () => {
      const files: FileEntry[] = [
        {
          src_rel: "err.jpg",
          dst_rel: "err.jpg",
          bytes: 0,
          hash: "",
          status: "error",
          error: "read error",
          media_type: "PHOTO",
        },
        {
          src_rel: "dupe.jpg",
          dst_rel: "dupe.jpg",
          bytes: 100,
          hash: "abc",
          status: "skipped_duplicate",
          duplicate_of: "other.jpg",
          media_type: "PHOTO",
        },
      ];

      const result = await runTriage({ files, projectRoot: tmpDir });
      expect(result.file_count).toBe(0);
      expect(result.flagged_files).toHaveLength(0);
    });

    it("emits progress events", async () => {
      // Create enough files to trigger progress (>10)
      const files: FileEntry[] = [];
      for (let i = 0; i < 12; i++) {
        const name = `triage-progress-${i}.jpg`;
        await writeValidJpeg(name);
        files.push({
          src_rel: name,
          dst_rel: name,
          bytes: 100,
          hash: `hash${i}`,
          status: "copied",
          media_type: "PHOTO",
        });
      }

      const events: Array<{ type: string }> = [];
      await runTriage({ files, projectRoot: tmpDir }, (e) => events.push(e));

      const progressEvents = events.filter((e) => e.type === "ingest.triage.progress");
      expect(progressEvents.length).toBeGreaterThanOrEqual(1);

      const doneEvents = events.filter((e) => e.type === "ingest.triage.done");
      expect(doneEvents).toHaveLength(1);
    });

    it("attaches triage_flags to FileEntry", async () => {
      await writeCorruptFile("triage-attach-corrupt.jpg");

      const files: FileEntry[] = [
        {
          src_rel: "triage-attach-corrupt.jpg",
          dst_rel: "triage-attach-corrupt.jpg",
          bytes: 10,
          hash: "bad2",
          status: "copied",
          media_type: "PHOTO",
        },
      ];

      await runTriage({ files, projectRoot: tmpDir });
      expect(files[0].triage_flags).toBeDefined();
      expect(files[0].triage_flags!.length).toBeGreaterThan(0);
      expect(files[0].triage_flags![0].kind).toBe("unreadable");
    });
  });
});
