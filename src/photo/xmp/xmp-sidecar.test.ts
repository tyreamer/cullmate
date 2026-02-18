import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyXmpPatches, buildXmpXml, readXmpSidecar, writeXmpSidecar } from "./xmp-sidecar.js";

describe("xmp-sidecar", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baxbot-xmp-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("buildXmpXml()", () => {
    it("generates valid XML with all fields", () => {
      const xml = buildXmpXml({
        creator: "Jane Doe",
        rights: "\u00A9 2026 Jane Doe",
        webStatement: "https://janedoe.com",
        credit: "JD Photography",
      });

      expect(xml).toContain('<?xpacket begin="\uFEFF"');
      expect(xml).toContain("<?xpacket end=");
      expect(xml).toContain("<x:xmpmeta");
      expect(xml).toContain("<rdf:RDF");
      expect(xml).toContain("<dc:creator>");
      expect(xml).toContain("<rdf:li>Jane Doe</rdf:li>");
      expect(xml).toContain("\u00A9 2026 Jane Doe");
      expect(xml).toContain('xmpRights:WebStatement="https://janedoe.com"');
      expect(xml).toContain('photoshop:Credit="JD Photography"');
    });

    it("generates valid XML with partial fields", () => {
      const xml = buildXmpXml({ creator: "John" });

      expect(xml).toContain("<dc:creator>");
      expect(xml).toContain("<rdf:li>John</rdf:li>");
      expect(xml).not.toContain("dc:rights");
      expect(xml).not.toContain("xmpRights:WebStatement");
      expect(xml).not.toContain("photoshop:Credit");
    });

    it("generates valid XML with empty patch", () => {
      const xml = buildXmpXml({});

      expect(xml).toContain("<rdf:Description");
      expect(xml).not.toContain("<dc:creator>");
      expect(xml).not.toContain("<dc:rights>");
    });

    it("escapes XML entities in values", () => {
      const xml = buildXmpXml({
        creator: 'Jane "J&J" <Doe>',
        rights: "Tom's & Jerry's",
      });

      expect(xml).toContain("Jane &quot;J&amp;J&quot; &lt;Doe&gt;");
      expect(xml).toContain("Tom&apos;s &amp; Jerry&apos;s");
    });
  });

  describe("writeXmpSidecar()", () => {
    it("writes .xmp next to a media file", async () => {
      const mediaPath = path.join(tmpDir, "IMG_001.cr2");
      await fs.writeFile(mediaPath, "fake-raw-data");

      const result = await writeXmpSidecar(mediaPath, {
        creator: "Jane Doe",
        rights: "\u00A9 2026 Jane Doe",
      });

      expect(result.written).toBe(true);
      expect(result.sidecarPath).toBe(path.join(tmpDir, "IMG_001.xmp"));
      expect(result.error).toBeUndefined();

      const content = await fs.readFile(result.sidecarPath, "utf-8");
      expect(content).toContain("<dc:creator>");
      expect(content).toContain("Jane Doe");
      expect(content).toContain("\u00A9 2026 Jane Doe");
    });

    it("returns { written: false, error } on read-only directory", async () => {
      const roDir = path.join(tmpDir, "readonly");
      await fs.mkdir(roDir, { recursive: true });
      const mediaPath = path.join(roDir, "IMG_002.jpg");
      await fs.writeFile(mediaPath, "fake-jpg-data");

      // Make directory read-only
      await fs.chmod(roDir, 0o555);

      const result = await writeXmpSidecar(mediaPath, {
        creator: "Test",
      });

      expect(result.written).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.sidecarPath).toBe(path.join(roDir, "IMG_002.xmp"));

      // Restore permissions for cleanup
      await fs.chmod(roDir, 0o755);
    });
  });

  describe("readXmpSidecar()", () => {
    it("round-trips: write then read returns same values", async () => {
      const mediaPath = path.join(tmpDir, "IMG_003.nef");
      await fs.writeFile(mediaPath, "fake-raw");

      const patch = {
        creator: "Alice Smith",
        rights: "\u00A9 2026 Alice Smith",
        webStatement: "https://alice.photos",
        credit: "Alice Studio",
      };

      const writeResult = await writeXmpSidecar(mediaPath, patch);
      expect(writeResult.written).toBe(true);

      const readResult = await readXmpSidecar(writeResult.sidecarPath);
      expect(readResult).not.toBeNull();
      expect(readResult!.creator).toBe("Alice Smith");
      expect(readResult!.rights).toBe("\u00A9 2026 Alice Smith");
      expect(readResult!.webStatement).toBe("https://alice.photos");
      expect(readResult!.credit).toBe("Alice Studio");
    });

    it("returns null for missing file", async () => {
      const result = await readXmpSidecar(path.join(tmpDir, "nonexistent.xmp"));
      expect(result).toBeNull();
    });
  });

  describe("applyXmpPatches()", () => {
    it("merges new creator into existing sidecar, preserves other fields", async () => {
      const sidecarPath = path.join(tmpDir, "IMG_004.xmp");
      const xml = buildXmpXml({
        creator: "Original Name",
        rights: "\u00A9 2025 Original",
        credit: "Original Studio",
      });
      await fs.writeFile(sidecarPath, xml);

      const result = await applyXmpPatches(sidecarPath, {
        creator: "New Name",
      });

      expect(result.written).toBe(true);

      const patched = await readXmpSidecar(sidecarPath);
      expect(patched!.creator).toBe("New Name");
      expect(patched!.rights).toBe("\u00A9 2025 Original");
      expect(patched!.credit).toBe("Original Studio");
    });

    it("clears fields with empty strings", async () => {
      const sidecarPath = path.join(tmpDir, "IMG_005.xmp");
      const xml = buildXmpXml({
        creator: "To Clear",
        credit: "Keep This",
      });
      await fs.writeFile(sidecarPath, xml);

      await applyXmpPatches(sidecarPath, { creator: "" });

      const patched = await readXmpSidecar(sidecarPath);
      expect(patched!.creator).toBeUndefined();
      expect(patched!.credit).toBe("Keep This");
    });
  });
});
