import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHasher, createHasherAsync, HashTransform, hashFile } from "./hash-transform.js";

describe("hash-transform", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cullmate-hash-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("createHasher (sync)", () => {
    it("sha256 produces correct digest for known input", () => {
      const hasher = createHasher("sha256");
      hasher.update(Buffer.from("hello world"));
      const hex = hasher.digestHex();
      const expected = crypto.createHash("sha256").update("hello world").digest("hex");
      expect(hex).toBe(expected);
    });

    it("sha512 produces correct digest", () => {
      const hasher = createHasher("sha512");
      hasher.update(Buffer.from("test data"));
      const hex = hasher.digestHex();
      const expected = crypto.createHash("sha512").update("test data").digest("hex");
      expect(hex).toBe(expected);
    });

    it("throws for blake3 (sync)", () => {
      expect(() => createHasher("blake3")).toThrow("Use createHasherAsync for blake3");
    });
  });

  describe("createHasherAsync", () => {
    it("sha256 produces correct digest", async () => {
      const hasher = await createHasherAsync("sha256");
      hasher.update(Buffer.from("hello world"));
      expect(hasher.digestHex()).toBe(
        crypto.createHash("sha256").update("hello world").digest("hex"),
      );
    });

    it("blake3 produces correct digest", async () => {
      const hasher = await createHasherAsync("blake3");
      hasher.update(Buffer.from("hello world"));
      const hex = hasher.digestHex();
      // blake3 hash of "hello world" is known
      expect(hex).toBe("d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24");
    });
  });

  describe("HashTransform", () => {
    it("passes all data through unchanged while computing correct hash", async () => {
      const input = Buffer.from("hello world, this is a test of the hash transform");
      const ht = new HashTransform("sha256");

      const chunks: Buffer[] = [];
      ht.on("data", (chunk: Buffer) => chunks.push(chunk));

      // Write data in two chunks
      ht.write(input.subarray(0, 20));
      ht.write(input.subarray(20));
      ht.end();

      await new Promise<void>((resolve) => ht.on("finish", resolve));
      await ht.ready();

      // Data passed through unchanged
      const output = Buffer.concat(chunks);
      expect(output.toString()).toBe(input.toString());

      // Hash is correct
      const expected = crypto.createHash("sha256").update(input).digest("hex");
      expect(ht.digestHex()).toBe(expected);
    });

    it("works with blake3", async () => {
      const input = Buffer.from("blake3 transform test");
      const ht = new HashTransform("blake3");

      const chunks: Buffer[] = [];
      ht.on("data", (chunk: Buffer) => chunks.push(chunk));

      ht.write(input);
      ht.end();

      await new Promise<void>((resolve) => ht.on("finish", resolve));
      await ht.ready();

      const output = Buffer.concat(chunks);
      expect(output.toString()).toBe(input.toString());
      const hex = ht.digestHex();
      expect(hex).toBeTruthy();
      expect(hex).toHaveLength(64); // blake3 outputs 256 bits = 64 hex chars
    });
  });

  describe("hashFile", () => {
    it("returns correct sha256 digest for a file", async () => {
      const content = "file content for hashing";
      const filePath = path.join(tmpDir, "test-file.txt");
      await fs.writeFile(filePath, content);

      const hex = await hashFile(filePath, "sha256");
      const expected = crypto.createHash("sha256").update(content).digest("hex");
      expect(hex).toBe(expected);
    });

    it("returns correct blake3 digest for a file", async () => {
      const content = "hello world";
      const filePath = path.join(tmpDir, "test-blake3.txt");
      await fs.writeFile(filePath, content);

      const hex = await hashFile(filePath, "blake3");
      expect(hex).toBe("d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24");
    });
  });
});
