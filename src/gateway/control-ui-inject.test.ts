import type { IncomingMessage, ServerResponse } from "node:http";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_UI_BOOTSTRAP_CONFIG_PATH } from "./control-ui-contract.js";
import { handleControlUiHttpRequest } from "./control-ui.js";

function createMockReq(url: string, method = "GET"): IncomingMessage {
  return { url, method, headers: {} } as unknown as IncomingMessage;
}

function createMockRes(): ServerResponse & {
  _statusCode: number;
  _headers: Map<string, string>;
  _body: string;
} {
  const headers = new Map<string, string>();
  let body = "";
  let statusCode = 200;
  const res = {
    get _statusCode() {
      return statusCode;
    },
    get statusCode() {
      return statusCode;
    },
    set statusCode(v: number) {
      statusCode = v;
    },
    _headers: headers,
    get _body() {
      return body;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(data?: string | Buffer) {
      if (data != null) {
        body = typeof data === "string" ? data : data.toString("utf-8");
      }
    },
  } as unknown as ServerResponse & {
    _statusCode: number;
    _headers: Map<string, string>;
    _body: string;
  };
  return res;
}

describe("control-ui token injection", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cullmate-ui-inject-"));
    await fsp.writeFile(
      path.join(tmpDir, "index.html"),
      "<!DOCTYPE html><html><head><title>Test</title></head><body></body></html>",
    );
  });

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("injects auth token meta tag into served HTML", () => {
    const req = createMockReq("/");
    const res = createMockRes();
    handleControlUiHttpRequest(req, res, {
      root: { kind: "resolved", path: tmpDir },
      authToken: "abcd1234",
    });
    expect(res._body).toContain('<meta name="cullmate-auth-token" content="abcd1234">');
    expect(res._body).toContain("</head>");
  });

  it("serves HTML without token meta when authToken is not provided", () => {
    const req = createMockReq("/");
    const res = createMockRes();
    handleControlUiHttpRequest(req, res, {
      root: { kind: "resolved", path: tmpDir },
    });
    expect(res._body).not.toContain("cullmate-auth-token");
    expect(res._body).toContain("</head>");
  });

  it("HTML-escapes the token to prevent XSS", () => {
    const req = createMockReq("/");
    const res = createMockRes();
    handleControlUiHttpRequest(req, res, {
      root: { kind: "resolved", path: tmpDir },
      authToken: '"><script>alert("xss")</script>',
    });
    expect(res._body).not.toContain('<script>alert("xss")</script>');
    expect(res._body).toContain("cullmate-auth-token");
    expect(res._body).toContain("&quot;");
  });

  it("includes authToken in bootstrap config response", () => {
    const req = createMockReq(CONTROL_UI_BOOTSTRAP_CONFIG_PATH);
    const res = createMockRes();
    handleControlUiHttpRequest(req, res, {
      root: { kind: "resolved", path: tmpDir },
      authToken: "test-token-abc",
    });
    const parsed = JSON.parse(res._body);
    expect(parsed.authToken).toBe("test-token-abc");
  });

  it("omits authToken from bootstrap config when not provided", () => {
    const req = createMockReq(CONTROL_UI_BOOTSTRAP_CONFIG_PATH);
    const res = createMockRes();
    handleControlUiHttpRequest(req, res, {
      root: { kind: "resolved", path: tmpDir },
    });
    const parsed = JSON.parse(res._body);
    expect(parsed.authToken).toBeUndefined();
  });
});
