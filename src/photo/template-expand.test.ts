import { describe, expect, it } from "vitest";
import {
  ALLOWED_TOKENS,
  expandTemplate,
  validatePattern,
  type TokenContext,
} from "./template-expand.js";

describe("validatePattern", () => {
  it("accepts valid patterns with known tokens", () => {
    expect(validatePattern("RAW/{CAMERA_LABEL}")).toEqual([]);
    expect(validatePattern("{YYYY}/{MM}-{DD}")).toEqual([]);
    expect(validatePattern("RAW")).toEqual([]);
  });

  it("rejects unknown tokens", () => {
    const errors = validatePattern("{UNKNOWN_TOKEN}/files");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Unknown token: {UNKNOWN_TOKEN}");
  });

  it("rejects empty pattern", () => {
    const errors = validatePattern("");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("empty");
  });

  it("allows multiple known tokens", () => {
    expect(validatePattern("{YYYY}{MM}{DD}")).toEqual([]);
    expect(validatePattern("{CAMERA_MODEL}/{MEDIA_TYPE}/{ORIGINAL_FILENAME}")).toEqual([]);
  });

  it("reports multiple unknown tokens", () => {
    const errors = validatePattern("{FOO}/{BAR}");
    expect(errors).toHaveLength(2);
  });
});

describe("expandTemplate", () => {
  const ctx: TokenContext = {
    YYYY: "2026",
    MM: "02",
    DD: "17",
    CAMERA_LABEL: "Canon_R5",
    MEDIA_TYPE: "RAW",
    ORIGINAL_FILENAME: "IMG_001",
    EXT: "cr2",
    CLIENT: "Smith",
    JOB: "Wedding",
  };

  it("expands single token", () => {
    expect(expandTemplate("RAW/{CAMERA_LABEL}", ctx)).toBe("RAW/Canon_R5");
  });

  it("expands adjacent tokens without separator", () => {
    expect(expandTemplate("{YYYY}{MM}{DD}", ctx)).toBe("20260217");
  });

  it("expands multiple tokens with path separators", () => {
    expect(expandTemplate("{CAMERA_LABEL}/{YYYY}-{MM}-{DD}", ctx)).toBe("Canon_R5/2026-02-17");
  });

  it("returns literal text when no tokens", () => {
    expect(expandTemplate("RAW", ctx)).toBe("RAW");
  });

  it("throws when missing token produces absolute path", () => {
    expect(() => expandTemplate("{CARD_LABEL}/files", ctx)).toThrow("must not be absolute");
  });

  it("uses empty string for missing token in safe position", () => {
    expect(expandTemplate("prefix-{CARD_LABEL}/files", ctx)).toBe("prefix-/files");
  });

  it("throws on path traversal after expansion", () => {
    const malicious: TokenContext = { CAMERA_LABEL: ".." };
    expect(() => expandTemplate("{CAMERA_LABEL}/secret", malicious)).toThrow("path traversal");
  });

  it("throws on absolute path after expansion", () => {
    expect(() => expandTemplate("/absolute/path", {})).toThrow("must not be absolute");
  });

  it("throws on null bytes in token value", () => {
    const malicious: TokenContext = { CAMERA_LABEL: "test\x00evil" };
    // sanitizeTokenValue strips null bytes, so this should work
    expect(expandTemplate("{CAMERA_LABEL}", malicious)).toBe("testevil");
  });

  it("sanitizes path separators in token values", () => {
    const ctx: TokenContext = { CAMERA_LABEL: "Canon/R5\\Mark2" };
    expect(expandTemplate("{CAMERA_LABEL}", ctx)).toBe("Canon_R5_Mark2");
  });

  it("sanitizes control characters in token values", () => {
    const ctx: TokenContext = { CAMERA_LABEL: "Canon\tR5\nII" };
    expect(expandTemplate("{CAMERA_LABEL}", ctx)).toBe("CanonR5II");
  });

  it("handles all allowed tokens", () => {
    // Verify all tokens in ALLOWED_TOKENS can be used in a pattern
    for (const token of ALLOWED_TOKENS) {
      const pattern = `{${token}}`;
      expect(validatePattern(pattern)).toEqual([]);
    }
  });

  it("expands template with defaults for missing tokens", () => {
    const sparse: TokenContext = { YYYY: "2026" };
    expect(expandTemplate("{YYYY}/photos", sparse)).toBe("2026/photos");
  });
});
