import { describe, expect, it, vi } from "vitest";
import { toolsInvokeHandlers } from "./tools-invoke.js";

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({}),
}));

vi.mock("../../agents/openclaw-tools.js", () => ({
  createOpenClawTools: vi.fn().mockReturnValue([
    {
      name: "demo_tool.ping",
      label: "Ping",
      description: "Returns a health check.",
      parameters: {},
      execute: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify({ ok: true, time: "t", version: "v" }) }],
      }),
    },
  ]),
}));

const noop = () => {};

function makeOpts(params: Record<string, unknown>) {
  const respond = vi.fn();
  const broadcasts: Array<{ event: string; payload: unknown }> = [];
  const context = {
    broadcast: (event: string, payload: unknown) => {
      broadcasts.push({ event, payload });
    },
  } as unknown as Parameters<(typeof toolsInvokeHandlers)["tools.invoke"]>[0]["context"];
  return {
    params,
    respond,
    broadcasts,
    context,
    client: null,
    req: { id: "req-1", type: "req" as const, method: "tools.invoke" },
    isWebchatConnect: noop,
  };
}

describe("tools.invoke handler", () => {
  it("returns error when name is missing", async () => {
    const opts = makeOpts({});
    await toolsInvokeHandlers["tools.invoke"](opts);

    expect(opts.respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "tools.invoke requires params.name" }),
    );
  });

  it("returns error when tool is not found", async () => {
    const opts = makeOpts({ name: "nonexistent.tool" });
    await toolsInvokeHandlers["tools.invoke"](opts);

    expect(opts.respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "Tool not found: nonexistent.tool" }),
    );
  });

  it("invokes a tool and returns result with streaming status events", async () => {
    const opts = makeOpts({ name: "demo_tool.ping", args: {} });
    await toolsInvokeHandlers["tools.invoke"](opts);

    // Should have emitted running + done status events
    expect(opts.broadcasts).toHaveLength(2);
    expect(opts.broadcasts[0]).toEqual({
      event: "chat",
      payload: { type: "tool_status", tool: "demo_tool.ping", status: "running" },
    });
    expect(opts.broadcasts[1]).toEqual({
      event: "chat",
      payload: { type: "tool_status", tool: "demo_tool.ping", status: "done" },
    });

    // Should respond with result
    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ tool: "demo_tool.ping" }),
      undefined,
    );
  });

  it("emits error status when tool execution fails", async () => {
    const { createOpenClawTools } = await import("../../agents/openclaw-tools.js");
    vi.mocked(createOpenClawTools).mockReturnValueOnce([
      {
        name: "demo_tool.failing",
        label: "Fail",
        description: "Always fails.",
        parameters: {},
        execute: vi.fn().mockRejectedValue(new Error("boom")),
      },
      // oxlint-disable-next-line typescript/no-explicit-any
    ] as any);

    const opts = makeOpts({ name: "demo_tool.failing" });
    await toolsInvokeHandlers["tools.invoke"](opts);

    expect(opts.broadcasts).toHaveLength(2);
    expect(opts.broadcasts[1]).toEqual({
      event: "chat",
      payload: { type: "tool_status", tool: "demo_tool.failing", status: "error" },
    });

    expect(opts.respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ message: "Tool execution failed: boom" }),
    );
  });
});
