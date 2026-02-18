import { describe, it, expect } from "vitest";
import { validateAITemplateResponse } from "./template-ai-validate.ts";

describe("validateAITemplateResponse", () => {
  it("rejects null", () => {
    const result = validateAITemplateResponse(null);
    expect(result.ok).toBe(false);
  });

  it("rejects non-object", () => {
    const result = validateAITemplateResponse("hello");
    expect(result.ok).toBe(false);
  });

  it("rejects non-JSON-parseable input when pre-parsed", () => {
    const result = validateAITemplateResponse(42);
    expect(result.ok).toBe(false);
  });

  it("rejects missing name", () => {
    const result = validateAITemplateResponse({
      description: "test",
      routing_rules: [{ label: "All", dest_pattern: "RAW" }],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("name");
    }
  });

  it("rejects empty routing_rules", () => {
    const result = validateAITemplateResponse({
      name: "Test",
      description: "test",
      routing_rules: [],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("folder rule");
    }
  });

  it("rejects routing rule with missing dest_pattern", () => {
    const result = validateAITemplateResponse({
      name: "Test",
      description: "test",
      routing_rules: [{ label: "All" }],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects path traversal in dest_pattern", () => {
    const result = validateAITemplateResponse({
      name: "Test",
      description: "test",
      routing_rules: [{ label: "All", dest_pattern: "../../../etc" }],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unsafe");
    }
  });

  it("rejects absolute paths in dest_pattern", () => {
    const result = validateAITemplateResponse({
      name: "Test",
      description: "test",
      routing_rules: [{ label: "All", dest_pattern: "/usr/bin/evil" }],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid media_type", () => {
    const result = validateAITemplateResponse({
      name: "Test",
      description: "test",
      routing_rules: [{ label: "All", dest_pattern: "RAW", match: { media_type: "INVALID" } }],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a valid simple template", () => {
    const result = validateAITemplateResponse({
      name: "Simple",
      description: "All files in one folder",
      routing_rules: [{ label: "All files", dest_pattern: "RAW" }],
      scaffold_dirs: ["EXPORTS"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.name).toBe("Simple");
      expect(result.template.is_preset).toBe(false);
      expect(result.template.template_id).toMatch(/^custom:/);
      expect(result.template.routing_rules).toHaveLength(1);
      expect(result.template.scaffold_dirs).toEqual(["EXPORTS"]);
    }
  });

  it("accepts a valid template with media_type matches", () => {
    const result = validateAITemplateResponse({
      name: "Media Split",
      description: "Separate RAW and video",
      routing_rules: [
        { label: "RAW", dest_pattern: "RAW", match: { media_type: "RAW" } },
        { label: "Video", dest_pattern: "VIDEO", match: { media_type: "VIDEO" } },
        { label: "Other", dest_pattern: "OTHER" },
      ],
      scaffold_dirs: ["DELIVERY"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.routing_rules).toHaveLength(3);
    }
  });

  it("accepts template with tokens in dest_pattern", () => {
    const result = validateAITemplateResponse({
      name: "By Camera",
      description: "Organized by camera",
      routing_rules: [{ label: "By camera", dest_pattern: "{CAMERA_LABEL}/{YYYY}-{MM}-{DD}" }],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.routing_rules[0].dest_pattern).toBe("{CAMERA_LABEL}/{YYYY}-{MM}-{DD}");
    }
  });

  it("defaults missing scaffold_dirs to empty array", () => {
    const result = validateAITemplateResponse({
      name: "No scaffold",
      description: "test",
      routing_rules: [{ label: "All", dest_pattern: "RAW" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.scaffold_dirs).toEqual([]);
    }
  });

  it("defaults missing token_defaults to empty object", () => {
    const result = validateAITemplateResponse({
      name: "Test",
      description: "test",
      routing_rules: [{ label: "All", dest_pattern: "RAW" }],
      scaffold_dirs: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.token_defaults).toEqual({});
    }
  });

  it("error messages use no jargon", () => {
    const cases = [
      null,
      {},
      { name: "", routing_rules: [], scaffold_dirs: [] },
      { name: "X", routing_rules: [{ label: "A", dest_pattern: "../up" }], scaffold_dirs: [] },
    ];
    for (const input of cases) {
      const result = validateAITemplateResponse(input);
      if (!result.ok) {
        expect(result.error).not.toMatch(/json/i);
        expect(result.error).not.toMatch(/schema/i);
        expect(result.error).not.toMatch(/parse/i);
        expect(result.error).not.toMatch(/token/i);
        expect(result.error).not.toMatch(/validation/i);
      }
    }
  });
});
