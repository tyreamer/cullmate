import { describe, expect, it } from "vitest";
import { suggestProjectName } from "./scan.js";

describe("suggestProjectName", () => {
  it("uses last path segment with date prefix", () => {
    const result = suggestProjectName("/Volumes/SD/DCIM");
    const ymd = todayYMD();
    expect(result).toBe(`${ymd}_DCIM`);
  });

  it("handles nested paths", () => {
    const result = suggestProjectName("/Volumes/SD/DCIM/100CANON");
    expect(result).toBe(`${todayYMD()}_100CANON`);
  });

  it("sanitizes spaces and special characters", () => {
    const result = suggestProjectName("/path/with spaces/My Photos");
    expect(result).toBe(`${todayYMD()}_My_Photos`);
  });

  it("returns just the date for empty path", () => {
    const result = suggestProjectName("");
    expect(result).toBe(todayYMD());
  });

  it("returns just the date for root path", () => {
    const result = suggestProjectName("/");
    expect(result).toBe(todayYMD());
  });

  it("handles Windows-style separators", () => {
    const result = suggestProjectName("D:\\Photos\\DCIM");
    expect(result).toBe(`${todayYMD()}_DCIM`);
  });

  it("preserves dots and hyphens", () => {
    const result = suggestProjectName("/path/my-project.2026");
    expect(result).toBe(`${todayYMD()}_my-project.2026`);
  });
});

function todayYMD(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}
