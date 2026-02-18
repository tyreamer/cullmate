import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateTemplateFromPrompt } from "./template-from-prompt.js";

const VALID_TEMPLATE_RESPONSE = JSON.stringify({
  template_id: "custom:ignored",
  name: "Portrait Studio",
  description: "RAW by camera, exports folder for edits",
  is_preset: false,
  routing_rules: [
    {
      label: "RAW by camera",
      match: { media_type: "RAW" },
      dest_pattern: "RAW/{CAMERA_LABEL}",
    },
    { label: "Other files", dest_pattern: "OTHER" },
  ],
  scaffold_dirs: ["EXPORTS", "DELIVERY"],
  token_defaults: {},
});

const INVALID_TEMPLATE_RESPONSE = JSON.stringify({
  template_id: "custom:bad",
  name: "Bad Template",
  description: "This has no routing rules",
  is_preset: false,
  routing_rules: [],
  scaffold_dirs: [],
  token_defaults: {},
});

const FIXED_TEMPLATE_RESPONSE = VALID_TEMPLATE_RESPONSE;

function mockFetch(responses: Array<{ ok: boolean; status?: number; body?: string }>) {
  let callIndex = 0;
  return vi.fn(async () => {
    const resp = responses[callIndex++] ?? { ok: false, status: 500 };
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: async () => JSON.parse(resp.body ?? '{"response":""}'),
    };
  });
}

describe("generateTemplateFromPrompt", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses a valid Ollama response into a FolderTemplate", async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: JSON.stringify({ response: VALID_TEMPLATE_RESPONSE }) },
    ]) as unknown as typeof fetch;

    const template = await generateTemplateFromPrompt("RAW by camera with exports", "llama3.2");

    expect(template.name).toBe("Portrait Studio");
    expect(template.is_preset).toBe(false);
    expect(template.template_id).toMatch(/^custom:/);
    expect(template.routing_rules).toHaveLength(2);
    expect(template.routing_rules[0].dest_pattern).toBe("RAW/{CAMERA_LABEL}");
    expect(template.scaffold_dirs).toEqual(["EXPORTS", "DELIVERY"]);
  });

  it("extracts JSON from code-fenced response", async () => {
    const fencedResponse = `Here's your template:\n\`\`\`json\n${VALID_TEMPLATE_RESPONSE}\n\`\`\`\nHope this helps!`;
    globalThis.fetch = mockFetch([
      { ok: true, body: JSON.stringify({ response: fencedResponse }) },
    ]) as unknown as typeof fetch;

    const template = await generateTemplateFromPrompt("test", "llama3.2");
    expect(template.name).toBe("Portrait Studio");
  });

  it("retries once on validation failure then succeeds", async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: JSON.stringify({ response: INVALID_TEMPLATE_RESPONSE }) },
      { ok: true, body: JSON.stringify({ response: FIXED_TEMPLATE_RESPONSE }) },
    ]) as unknown as typeof fetch;

    const template = await generateTemplateFromPrompt("test", "llama3.2");
    expect(template.name).toBe("Portrait Studio");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws after retry exhaustion with validation errors", async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: JSON.stringify({ response: INVALID_TEMPLATE_RESPONSE }) },
      { ok: true, body: JSON.stringify({ response: INVALID_TEMPLATE_RESPONSE }) },
    ]) as unknown as typeof fetch;

    await expect(generateTemplateFromPrompt("test", "llama3.2")).rejects.toThrow(
      /failed validation/,
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws on HTTP error from Ollama", async () => {
    globalThis.fetch = mockFetch([
      { ok: false, status: 500, body: '{"response":""}' },
      { ok: false, status: 500, body: '{"response":""}' },
    ]) as unknown as typeof fetch;

    await expect(generateTemplateFromPrompt("test", "llama3.2")).rejects.toThrow(/status 500/);
  });

  it("throws on unparseable JSON response", async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: JSON.stringify({ response: "not json at all" }) },
      { ok: true, body: JSON.stringify({ response: "still not json" }) },
    ]) as unknown as typeof fetch;

    await expect(generateTemplateFromPrompt("test", "llama3.2")).rejects.toThrow(
      /Failed to parse JSON/,
    );
  });

  it("throws on timeout", async () => {
    globalThis.fetch = vi.fn(async (_url, opts) => {
      // Wait until abort signal fires
      return new Promise((_resolve, reject) => {
        const signal = (opts as RequestInit)?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new DOMException("The operation was aborted.", "AbortError");
            reject(err);
          });
        }
      });
    }) as unknown as typeof fetch;

    await expect(generateTemplateFromPrompt("test", "llama3.2")).rejects.toThrow(/timed out/);
  }, 35_000);

  it("uses custom base URL", async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: JSON.stringify({ response: VALID_TEMPLATE_RESPONSE }) },
    ]) as unknown as typeof fetch;

    await generateTemplateFromPrompt("test", "llama3.2", "http://10.0.0.5:11434");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://10.0.0.5:11434/api/generate",
      expect.anything(),
    );
  });

  it("overrides is_preset to false and generates new template_id", async () => {
    const sneakyTemplate = JSON.stringify({
      ...JSON.parse(VALID_TEMPLATE_RESPONSE),
      is_preset: true,
      template_id: "preset:hacked",
    });
    globalThis.fetch = mockFetch([
      { ok: true, body: JSON.stringify({ response: sneakyTemplate }) },
    ]) as unknown as typeof fetch;

    const template = await generateTemplateFromPrompt("test", "llama3.2");
    expect(template.is_preset).toBe(false);
    expect(template.template_id).not.toBe("preset:hacked");
    expect(template.template_id).toMatch(/^custom:/);
  });
});
