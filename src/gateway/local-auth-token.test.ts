import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureLocalAuthToken, readLocalAuthToken } from "./local-auth-token.js";

describe("local-auth-token", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "baxbot-auth-test-"));
  });
  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates a 64-hex-char token", () => {
    const token = ensureLocalAuthToken(tmpDir);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns same token on second call (idempotent)", () => {
    const t1 = ensureLocalAuthToken(tmpDir);
    const t2 = ensureLocalAuthToken(tmpDir);
    expect(t1).toBe(t2);
  });

  it("creates file with 0600 permissions", async () => {
    if (process.platform === "win32") {
      return;
    }
    const stat = await fs.stat(path.join(tmpDir, "local-auth-token"));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("readLocalAuthToken returns the token", () => {
    const token = ensureLocalAuthToken(tmpDir);
    const read = readLocalAuthToken(tmpDir);
    expect(read).toBe(token);
  });

  it("readLocalAuthToken returns null for missing dir", () => {
    const result = readLocalAuthToken(path.join(tmpDir, "nonexistent"));
    expect(result).toBeNull();
  });

  it("creates parent directory if missing", async () => {
    const nested = path.join(tmpDir, "nested", "deep");
    const token = ensureLocalAuthToken(nested);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stat = await fs.stat(nested);
    expect(stat.isDirectory()).toBe(true);
  });
});
