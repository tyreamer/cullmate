import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FileEntry } from "./types.js";
import { hashFile } from "./hash-transform.js";
import { selectSentinelFiles, verifyFiles } from "./verify.js";

function makeEntry(i: number, overrides?: Partial<FileEntry>): FileEntry {
  return {
    src_rel: `dir/IMG_${String(i).padStart(4, "0")}.jpg`,
    dst_rel: `01_RAW/dir/IMG_${String(i).padStart(4, "0")}.jpg`,
    bytes: 1000 + i,
    hash: `hash_${i}`,
    status: "copied",
    ...overrides,
  };
}

describe("verify", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baxbot-verify-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("selectSentinelFiles", () => {
    it("with 100 files returns deduped set <= 75", () => {
      const files = Array.from({ length: 100 }, (_, i) => makeEntry(i));
      const sentinel = selectSentinelFiles(files);
      expect(sentinel.length).toBeLessThanOrEqual(75);
      expect(sentinel.length).toBeGreaterThan(0);

      // All entries should be unique by src_rel
      const unique = new Set(sentinel.map((f) => f.src_rel));
      expect(unique.size).toBe(sentinel.length);
    });

    it("with 10 files returns all 10", () => {
      const files = Array.from({ length: 10 }, (_, i) => makeEntry(i));
      const sentinel = selectSentinelFiles(files);
      expect(sentinel.length).toBe(10);
    });

    it("excludes non-copied files", () => {
      const files = [
        makeEntry(0, { status: "copied" }),
        makeEntry(1, { status: "skipped_exists" }),
        makeEntry(2, { status: "error" }),
        makeEntry(3, { status: "copied" }),
      ];
      const sentinel = selectSentinelFiles(files);
      expect(sentinel.every((f) => f.status === "copied")).toBe(true);
      expect(sentinel.length).toBe(2);
    });
  });

  describe("verifyFiles", () => {
    it("detects correct hash match", async () => {
      // Create a file and compute its hash
      const projectRoot = path.join(tmpDir, "verify-match");
      const rawDir = path.join(projectRoot, "01_RAW", "sub");
      await fs.mkdir(rawDir, { recursive: true });

      const content = "correct content";
      await fs.writeFile(path.join(rawDir, "photo.jpg"), content);

      const hash = await hashFile(path.join(rawDir, "photo.jpg"), "sha256");

      const files: FileEntry[] = [
        {
          src_rel: "sub/photo.jpg",
          dst_rel: "01_RAW/sub/photo.jpg",
          bytes: Buffer.byteLength(content),
          hash,
          status: "copied",
        },
      ];

      await verifyFiles(files, projectRoot, "sha256", "full");

      expect(files[0].verified).toBe(true);
      expect(files[0].hash_dest).toBe(hash);
    });

    it("detects mismatch when dest is corrupted", async () => {
      const projectRoot = path.join(tmpDir, "verify-mismatch");
      const rawDir = path.join(projectRoot, "01_RAW");
      await fs.mkdir(rawDir, { recursive: true });

      await fs.writeFile(path.join(rawDir, "photo.jpg"), "corrupted content");

      const files: FileEntry[] = [
        {
          src_rel: "photo.jpg",
          dst_rel: "01_RAW/photo.jpg",
          bytes: 100,
          hash: "0000000000000000000000000000000000000000000000000000000000000000",
          status: "copied",
        },
      ];

      await verifyFiles(files, projectRoot, "sha256", "full");

      expect(files[0].verified).toBe(false);
      expect(files[0].hash_dest).not.toBe(files[0].hash);
    });
  });
});
