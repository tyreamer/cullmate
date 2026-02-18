import { describe, expect, it } from "vitest";
import type { FolderTemplate } from "./folder-template.js";
import { ALL_PRESETS } from "./template-presets.js";
import { validateFolderTemplate } from "./template-validate.js";

function makeValidTemplate(overrides?: Partial<FolderTemplate>): FolderTemplate {
  return {
    template_id: "test:valid",
    name: "Test Template",
    description: "A valid test template",
    is_preset: false,
    routing_rules: [{ label: "All files", dest_pattern: "RAW" }],
    scaffold_dirs: ["EXPORTS"],
    token_defaults: {},
    ...overrides,
  };
}

describe("validateFolderTemplate", () => {
  it("accepts a valid template", () => {
    const errors = validateFolderTemplate(makeValidTemplate());
    expect(errors).toEqual([]);
  });

  it("rejects missing template_id", () => {
    const errors = validateFolderTemplate(makeValidTemplate({ template_id: "" }));
    expect(errors).toContain("template_id is required");
  });

  it("rejects missing name", () => {
    const errors = validateFolderTemplate(makeValidTemplate({ name: "" }));
    expect(errors).toContain("name is required");
  });

  it("rejects empty routing rules", () => {
    const errors = validateFolderTemplate(makeValidTemplate({ routing_rules: [] }));
    expect(errors).toContain("At least one routing rule is required");
  });

  it("rejects routing rule with empty dest_pattern", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({
        routing_rules: [{ label: "All", dest_pattern: "" }],
      }),
    );
    expect(errors.some((e) => e.includes("dest_pattern"))).toBe(true);
  });

  it("rejects routing rule with unknown token in dest_pattern", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({
        routing_rules: [{ label: "All", dest_pattern: "{BOGUS_TOKEN}" }],
      }),
    );
    expect(errors.some((e) => e.includes("Unknown token"))).toBe(true);
  });

  it("warns if last rule is not a catch-all", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({
        routing_rules: [{ label: "RAW", match: { media_type: "RAW" }, dest_pattern: "RAW" }],
      }),
    );
    expect(errors.some((e) => e.includes("catch-all"))).toBe(true);
  });

  it("accepts last rule as catch-all (no match)", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({
        routing_rules: [
          { label: "RAW", match: { media_type: "RAW" }, dest_pattern: "RAW" },
          { label: "All", dest_pattern: "OTHER" },
        ],
      }),
    );
    expect(errors).toEqual([]);
  });

  it("rejects scaffold_dirs with tokens", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({
        scaffold_dirs: ["{YYYY}/exports"],
      }),
    );
    expect(errors.some((e) => e.includes("scaffold_dirs") && e.includes("tokens"))).toBe(true);
  });

  it("rejects scaffold_dirs with absolute paths", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({
        scaffold_dirs: ["/absolute/path"],
      }),
    );
    expect(errors.some((e) => e.includes("absolute"))).toBe(true);
  });

  it("rejects scaffold_dirs with path traversal", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({
        scaffold_dirs: ["../escape"],
      }),
    );
    expect(errors.some((e) => e.includes("path traversal"))).toBe(true);
  });

  it("rejects deeply nested dest_pattern", () => {
    const deepPath = Array(12).fill("a").join("/");
    const errors = validateFolderTemplate(
      makeValidTemplate({
        routing_rules: [{ label: "Deep", dest_pattern: deepPath }],
      }),
    );
    expect(errors.some((e) => e.includes("max folder depth"))).toBe(true);
  });

  it("validates job_root_pattern tokens", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({ job_root_pattern: "{INVALID_TOKEN}" }),
    );
    expect(errors.some((e) => e.includes("job_root_pattern") && e.includes("Unknown token"))).toBe(
      true,
    );
  });

  it("accepts valid job_root_pattern", () => {
    const errors = validateFolderTemplate(
      makeValidTemplate({ job_root_pattern: "{CLIENT}_{JOB}_{YYYY}{MM}{DD}" }),
    );
    expect(errors).toEqual([]);
  });
});

describe("preset templates pass validation", () => {
  for (const preset of ALL_PRESETS) {
    it(`preset "${preset.name}" is valid`, () => {
      const errors = validateFolderTemplate(preset);
      expect(errors).toEqual([]);
    });
  }
});
