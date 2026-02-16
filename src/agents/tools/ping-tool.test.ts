import { describe, expect, it } from "vitest";
import { createPingTool } from "./ping-tool.js";

describe("createPingTool", () => {
  it("returns ok with time and version", async () => {
    const tool = createPingTool();
    const result = await tool.execute("test-call-id", {});
    const parsed = JSON.parse(
      Array.isArray(result.content) ? (result.content[0] as { text: string }).text : "",
    );
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.time).toBe("string");
    expect(typeof parsed.version).toBe("string");
  });

  it("has correct tool name", () => {
    const tool = createPingTool();
    expect(tool.name).toBe("demo_tool.ping");
  });
});
