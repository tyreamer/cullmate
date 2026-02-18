import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIngestVerifyTool } from "./ingest-verify-tool.js";

describe("ingest-verify-tool", () => {
  const tool = createIngestVerifyTool();
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baxbot-tool-test-"));

    // Create test source
    const sourceDir = path.join(tmpDir, "source");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "test.jpg"), "photo-data");
    await fs.writeFile(path.join(sourceDir, "test.png"), "png-data");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("has correct name and label", () => {
    expect(tool.name).toBe("photo.ingest_verify");
    expect(tool.label).toBe("Photo Ingest & Verify");
  });

  it("has parameters schema", () => {
    expect(tool.parameters).toBeDefined();
    expect(tool.parameters.properties).toHaveProperty("source_path");
    expect(tool.parameters.properties).toHaveProperty("dest_project_path");
    expect(tool.parameters.properties).toHaveProperty("project_name");
  });

  it("execute returns valid result with manifest summary", async () => {
    const destDir = path.join(tmpDir, "dest");
    const result = await tool.execute("test-run-1", {
      source_path: path.join(tmpDir, "source"),
      dest_project_path: destDir,
      project_name: "ToolTest",
      verify_mode: "none",
      hash_algo: "sha256",
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);

    const text = result.content[0];
    expect(text.type).toBe("text");
    const payload = JSON.parse((text as { type: "text"; text: string }).text);
    expect(payload.ok).toBe(true);
    expect(payload.totals.success_count).toBe(2);
    expect(payload.project_root).toContain("ToolTest");
    expect(payload.manifest_path).toBeTruthy();
    expect(payload.report_path).toBeTruthy();
  });

  it("onUpdate receives progress events in order", async () => {
    const freshDest = path.join(tmpDir, "dest-progress");
    const updates: unknown[] = [];

    await tool.execute(
      "test-run-2",
      {
        source_path: path.join(tmpDir, "source"),
        dest_project_path: freshDest,
        project_name: "ProgressTest",
        verify_mode: "none",
        hash_algo: "sha256",
      },
      undefined,
      (update: unknown) => {
        updates.push(update);
      },
    );

    expect(updates.length).toBeGreaterThan(0);

    // Each update should have content and details
    for (const update of updates) {
      const u = update as { content: unknown[]; details: { type: string } };
      expect(u.content).toBeDefined();
      expect(u.details.type).toMatch(/^ingest\./);
    }

    // Check expected event ordering
    const types = updates.map((u) => (u as { details: { type: string } }).details.type);
    expect(types[0]).toBe("ingest.start");
    expect(types).toContain("ingest.scan.progress");
    expect(types).toContain("ingest.copy.progress");
    expect(types).toContain("ingest.report.generated");
    expect(types[types.length - 1]).toBe("ingest.done");
  });

  it("rejects invalid project_name with path separators", async () => {
    await expect(
      tool.execute("test-run-3", {
        source_path: path.join(tmpDir, "source"),
        dest_project_path: path.join(tmpDir, "bad"),
        project_name: "bad/name",
      }),
    ).rejects.toThrow("project_name must not contain path separators");
  });

  it("rejects missing source_path", async () => {
    await expect(
      tool.execute("test-run-4", {
        dest_project_path: path.join(tmpDir, "bad"),
        project_name: "Test",
      }),
    ).rejects.toThrow("source_path required");
  });
});
