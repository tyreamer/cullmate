import { describe, expect, it, vi } from "vitest";
import { systemHandlers } from "./system.js";

// Mock dependencies used by other handlers in the module
vi.mock("../../config/sessions.js", () => ({
  resolveMainSessionKeyFromConfig: vi.fn().mockReturnValue("main"),
}));
vi.mock("../../infra/heartbeat-events.js", () => ({
  getLastHeartbeatEvent: vi.fn().mockReturnValue(null),
}));
vi.mock("../../infra/heartbeat-runner.js", () => ({
  setHeartbeatsEnabled: vi.fn(),
}));
vi.mock("../../infra/system-events.js", () => ({
  enqueueSystemEvent: vi.fn(),
  isSystemEventContextChanged: vi.fn().mockReturnValue(false),
}));
vi.mock("../../infra/system-presence.js", () => ({
  listSystemPresence: vi.fn().mockReturnValue([]),
  updateSystemPresence: vi.fn().mockReturnValue({ key: "k", next: {}, changedKeys: [] }),
}));

function createMockRespond() {
  const calls: Array<{ success: boolean; result: unknown; error: unknown }> = [];
  const respond = (success: boolean, result: unknown, error: unknown) => {
    calls.push({ success, result, error });
  };
  return { respond, calls };
}

describe("system.open_path", () => {
  const handler = systemHandlers["system.open_path"];

  it("rejects when path is empty", () => {
    const { respond, calls } = createMockRespond();
    void handler({
      params: { path: "" },
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(false);
    expect(calls[0].error).toMatchObject({
      message: expect.stringContaining("requires params.path"),
    });
  });

  it("rejects when allowed_root is missing", () => {
    const { respond, calls } = createMockRespond();
    // Only runs the allowed_root check on macOS
    if (process.platform !== "darwin") {
      return;
    }
    void handler({
      params: { path: "/tmp/test" },
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(false);
    expect(calls[0].error).toMatchObject({
      message: expect.stringContaining("requires params.allowed_root"),
    });
  });

  it("rejects path outside allowed_root", () => {
    if (process.platform !== "darwin") {
      return;
    }
    const { respond, calls } = createMockRespond();
    void handler({
      params: {
        path: "/etc/passwd",
        allowed_root: "/tmp/myproject",
      },
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(false);
    expect(calls[0].error).toMatchObject({
      message: expect.stringContaining("outside allowed root"),
    });
  });

  it("rejects traversal attack within allowed_root", () => {
    if (process.platform !== "darwin") {
      return;
    }
    const { respond, calls } = createMockRespond();
    void handler({
      params: {
        path: "/tmp/myproject/../../../etc/passwd",
        allowed_root: "/tmp/myproject",
      },
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(false);
    expect(calls[0].error).toMatchObject({
      message: expect.stringContaining("outside allowed root"),
    });
  });

  it("rejects on non-macOS platforms", () => {
    if (process.platform === "darwin") {
      return;
    }
    const { respond, calls } = createMockRespond();
    void handler({
      params: {
        path: "/tmp/test",
        allowed_root: "/tmp",
      },
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(false);
    expect(calls[0].error).toMatchObject({
      message: expect.stringContaining("only supported on macOS"),
    });
  });
});

describe("system.pick_folder", () => {
  const handler = systemHandlers["system.pick_folder"];

  it("rejects on non-macOS platforms", () => {
    if (process.platform === "darwin") {
      return;
    }
    const { respond, calls } = createMockRespond();
    void handler({
      params: {},
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(false);
    expect(calls[0].error).toMatchObject({
      message: expect.stringContaining("only supported on macOS"),
    });
  });

  it("handler exists and is a function", () => {
    expect(typeof handler).toBe("function");
  });
});

describe("system.list_volumes", () => {
  const handler = systemHandlers["system.list_volumes"];

  it("rejects on non-macOS platforms", () => {
    if (process.platform === "darwin") {
      return;
    }
    const { respond, calls } = createMockRespond();
    void handler({
      params: {},
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(false);
    expect(calls[0].error).toMatchObject({
      message: expect.stringContaining("only supported on macOS"),
    });
  });

  it("returns volumes and suggestedSources arrays on macOS", () => {
    if (process.platform !== "darwin") {
      return;
    }
    const { respond, calls } = createMockRespond();
    void handler({
      params: {},
      respond,
      context: {} as never,
    } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].success).toBe(true);
    const result = calls[0].result as { volumes: unknown[]; suggestedSources: unknown[] };
    expect(Array.isArray(result.volumes)).toBe(true);
    expect(Array.isArray(result.suggestedSources)).toBe(true);
  });

  it("each volume entry has name and path", () => {
    if (process.platform !== "darwin") {
      return;
    }
    const { respond, calls } = createMockRespond();
    void handler({
      params: {},
      respond,
      context: {} as never,
    } as never);
    const result = calls[0].result as { volumes: Array<{ name: string; path: string }> };
    for (const vol of result.volumes) {
      expect(typeof vol.name).toBe("string");
      expect(typeof vol.path).toBe("string");
      expect(vol.path.startsWith("/Volumes/")).toBe(true);
    }
  });

  it("handler exists and is a function", () => {
    expect(typeof handler).toBe("function");
  });
});
