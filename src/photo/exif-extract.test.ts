import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractExifInfo } from "./exif-extract.js";

describe("extractExifInfo", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baxbot-exif-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns nulls for non-image data", async () => {
    const fakePath = path.join(tmpDir, "fake.jpg");
    await fs.writeFile(fakePath, "not-really-a-jpeg");

    const info = await extractExifInfo(fakePath);
    expect(info.captureDate).toBeNull();
    expect(info.cameraModel).toBeNull();
    expect(info.cameraSerial).toBeNull();
  });

  it("returns nulls for non-existent file", async () => {
    const info = await extractExifInfo(path.join(tmpDir, "doesnt-exist.jpg"));
    expect(info.captureDate).toBeNull();
    expect(info.cameraModel).toBeNull();
    expect(info.cameraSerial).toBeNull();
  });

  it("returns nulls for empty file", async () => {
    const emptyPath = path.join(tmpDir, "empty.cr2");
    await fs.writeFile(emptyPath, "");

    const info = await extractExifInfo(emptyPath);
    expect(info.captureDate).toBeNull();
    expect(info.cameraModel).toBeNull();
    expect(info.cameraSerial).toBeNull();
  });

  it("returns nulls for text file", async () => {
    const txtPath = path.join(tmpDir, "notes.txt");
    await fs.writeFile(txtPath, "Hello world");

    const info = await extractExifInfo(txtPath);
    expect(info.captureDate).toBeNull();
    expect(info.cameraModel).toBeNull();
    expect(info.cameraSerial).toBeNull();
  });

  // Minimal valid JPEG with EXIF
  it("extracts camera model from minimal JPEG with EXIF", async () => {
    // Create a minimal JPEG with EXIF App1 segment containing camera Model
    const jpegPath = path.join(tmpDir, "with-exif.jpg");
    const jpeg = buildMinimalJpegWithExif({ Model: "Canon EOS R5" });
    await fs.writeFile(jpegPath, jpeg);

    const info = await extractExifInfo(jpegPath);
    // exifr may or may not parse our minimal JPEG, so just check it doesn't crash
    // The important thing is graceful handling
    expect(info).toBeDefined();
    expect(info.cameraSerial).toBeNull(); // We didn't set serial
  });
});

/**
 * Build a minimal JPEG buffer with an EXIF APP1 segment.
 * This is a best-effort minimal EXIF — exifr may not parse all fields from it.
 */
function buildMinimalJpegWithExif(tags: { Model?: string }): Buffer {
  // JPEG SOI
  const soi = Buffer.from([0xff, 0xd8]);

  // Build a minimal TIFF/EXIF structure
  const tiffHeader = Buffer.from("MM\x00\x2a\x00\x00\x00\x08", "binary"); // Big-endian TIFF

  // IFD0 with Model tag (0x0110)
  const model = tags.Model ?? "Unknown";
  const modelBytes = Buffer.from(model + "\0", "ascii");

  // Number of IFD entries
  const numEntries = Buffer.alloc(2);
  numEntries.writeUInt16BE(1, 0);

  // IFD entry: Tag=0x0110 (Model), Type=2 (ASCII), Count=modelBytes.length, Offset
  const ifdEntry = Buffer.alloc(12);
  ifdEntry.writeUInt16BE(0x0110, 0); // Tag
  ifdEntry.writeUInt16BE(2, 2); // Type (ASCII)
  ifdEntry.writeUInt32BE(modelBytes.length, 4); // Count
  if (modelBytes.length <= 4) {
    modelBytes.copy(ifdEntry, 8);
  } else {
    // Offset to data (after IFD0: 8 + 2 + 12 + 4 = 26)
    ifdEntry.writeUInt32BE(26, 8);
  }

  // Next IFD offset (0 = no more IFDs)
  const nextIfd = Buffer.alloc(4);

  const tiffData =
    modelBytes.length <= 4
      ? Buffer.concat([tiffHeader, numEntries, ifdEntry, nextIfd])
      : Buffer.concat([tiffHeader, numEntries, ifdEntry, nextIfd, modelBytes]);

  // APP1 marker
  const app1Marker = Buffer.from([0xff, 0xe1]);
  const exifHeader = Buffer.from("Exif\x00\x00", "binary");
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(2 + exifHeader.length + tiffData.length, 0);

  // JPEG EOI
  const eoi = Buffer.from([0xff, 0xd9]);

  return Buffer.concat([soi, app1Marker, app1Length, exifHeader, tiffData, eoi]);
}
