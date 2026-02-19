import { describe, expect, it, vi } from "vitest";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { authorizeGatewayConnect, isLocalDirectRequest, resolveGatewayAuth } from "./auth.js";

function createLimiterSpy(): AuthRateLimiter & {
  check: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
} {
  return {
    check: vi.fn(() => ({ allowed: true, remaining: 10, retryAfterMs: 0 })),
    recordFailure: vi.fn(),
    reset: vi.fn(),
    size: () => 0,
    prune: () => {},
    dispose: () => {},
  };
}

describe("gateway auth", () => {
  it("resolves token/password from OPENCLAW gateway env vars", () => {
    expect(
      resolveGatewayAuth({
        authConfig: {},
        env: {
          OPENCLAW_GATEWAY_TOKEN: "env-token",
          OPENCLAW_GATEWAY_PASSWORD: "env-password",
        } as NodeJS.ProcessEnv,
      }),
    ).toMatchObject({
      mode: "password",
      token: "env-token",
      password: "env-password",
    });
  });

  it("does not resolve legacy CLAWDBOT gateway env vars", () => {
    expect(
      resolveGatewayAuth({
        authConfig: {},
        env: {
          CLAWDBOT_GATEWAY_TOKEN: "legacy-token",
          CLAWDBOT_GATEWAY_PASSWORD: "legacy-password",
        } as NodeJS.ProcessEnv,
      }),
    ).toMatchObject({
      mode: "none",
      token: undefined,
      password: undefined,
    });
  });

  it("does not throw when req is missing socket", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "token", token: "secret", allowTailscale: false },
      connectAuth: { token: "secret" },
      // Regression: avoid crashing on req.socket.remoteAddress when callers pass a non-IncomingMessage.
      req: {} as never,
    });
    expect(res.ok).toBe(true);
  });

  it("reports missing and mismatched token reasons", async () => {
    const missing = await authorizeGatewayConnect({
      auth: { mode: "token", token: "secret", allowTailscale: false },
      connectAuth: null,
    });
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe("token_missing");

    const mismatch = await authorizeGatewayConnect({
      auth: { mode: "token", token: "secret", allowTailscale: false },
      connectAuth: { token: "wrong" },
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reason).toBe("token_mismatch");
  });

  it("reports missing token config reason", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "token", allowTailscale: false },
      connectAuth: { token: "anything" },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("token_missing_config");
  });

  it("reports missing and mismatched password reasons", async () => {
    const missing = await authorizeGatewayConnect({
      auth: { mode: "password", password: "secret", allowTailscale: false },
      connectAuth: null,
    });
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe("password_missing");

    const mismatch = await authorizeGatewayConnect({
      auth: { mode: "password", password: "secret", allowTailscale: false },
      connectAuth: { password: "wrong" },
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reason).toBe("password_mismatch");
  });

  it("reports missing password config reason", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "password", allowTailscale: false },
      connectAuth: { password: "secret" },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("password_missing_config");
  });

  it("treats local tailscale serve hostnames as direct", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "token", token: "secret", allowTailscale: true },
      connectAuth: { token: "secret" },
      req: {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { host: "gateway.tailnet-1234.ts.net:443" },
      } as never,
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("shared_secret");
  });

  it("allows tailscale identity to satisfy token mode auth", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "token", token: "secret", allowTailscale: true },
      connectAuth: null,
      tailscaleWhois: async () => ({ login: "peter", name: "Peter" }),
      req: {
        socket: { remoteAddress: "127.0.0.1" },
        headers: {
          host: "gateway.local",
          "x-forwarded-for": "100.64.0.1",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "ai-hub.bone-egret.ts.net",
          "tailscale-user-login": "peter",
          "tailscale-user-name": "Peter",
        },
      } as never,
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("tailscale");
    expect(res.user).toBe("peter");
  });

  it("uses proxy-aware request client IP by default for rate-limit checks", async () => {
    const limiter = createLimiterSpy();
    const res = await authorizeGatewayConnect({
      auth: { mode: "token", token: "secret", allowTailscale: false },
      connectAuth: { token: "wrong" },
      req: {
        socket: { remoteAddress: "127.0.0.1" },
        headers: { "x-forwarded-for": "203.0.113.10" },
      } as never,
      trustedProxies: ["127.0.0.1"],
      rateLimiter: limiter,
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("token_mismatch");
    expect(limiter.check).toHaveBeenCalledWith("203.0.113.10", "shared-secret");
    expect(limiter.recordFailure).toHaveBeenCalledWith("203.0.113.10", "shared-secret");
  });

  it("passes custom rate-limit scope to limiter operations", async () => {
    const limiter = createLimiterSpy();
    const res = await authorizeGatewayConnect({
      auth: { mode: "password", password: "secret", allowTailscale: false },
      connectAuth: { password: "wrong" },
      rateLimiter: limiter,
      rateLimitScope: "custom-scope",
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("password_mismatch");
    expect(limiter.check).toHaveBeenCalledWith(undefined, "custom-scope");
    expect(limiter.recordFailure).toHaveBeenCalledWith(undefined, "custom-scope");
  });
});

describe("local loopback trust", () => {
  function makeReq(remoteAddress: string, host?: string, extraHeaders?: Record<string, string>) {
    return {
      socket: { remoteAddress },
      headers: { ...(host !== undefined ? { host } : {}), ...extraHeaders },
    } as never;
  }

  it("trusts loopback with standard localhost Host", () => {
    expect(isLocalDirectRequest(makeReq("127.0.0.1", "localhost:18789"))).toBe(true);
  });

  it("trusts loopback with 127.0.0.1 Host", () => {
    expect(isLocalDirectRequest(makeReq("127.0.0.1", "127.0.0.1:19001"))).toBe(true);
  });

  it("trusts loopback with 0.0.0.0 Host (wildcard bind)", () => {
    expect(isLocalDirectRequest(makeReq("127.0.0.1", "0.0.0.0:19001"))).toBe(true);
  });

  it("trusts loopback with missing Host header", () => {
    expect(isLocalDirectRequest(makeReq("127.0.0.1"))).toBe(true);
  });

  it("trusts loopback with machine hostname Host", () => {
    expect(isLocalDirectRequest(makeReq("127.0.0.1", "my-macbook.local:18789"))).toBe(true);
  });

  it("trusts IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", () => {
    expect(isLocalDirectRequest(makeReq("::ffff:127.0.0.1", "127.0.0.1:19001"))).toBe(true);
  });

  it("trusts IPv6 loopback (::1)", () => {
    expect(isLocalDirectRequest(makeReq("::1", "[::1]:18789"))).toBe(true);
  });

  it("rejects non-loopback remote address", () => {
    expect(isLocalDirectRequest(makeReq("192.168.1.100", "localhost:18789"))).toBe(false);
  });

  it("rejects loopback with untrusted forwarding headers", () => {
    expect(
      isLocalDirectRequest(
        makeReq("127.0.0.1", "127.0.0.1:18789", { "x-forwarded-for": "203.0.113.10" }),
      ),
    ).toBe(false);
  });

  it("rejects loopback proxy forwarding remote client even when trusted", () => {
    // Proxy at 127.0.0.1 forwards a remote client — resolved client IP is remote.
    expect(
      isLocalDirectRequest(
        makeReq("127.0.0.1", "127.0.0.1:18789", { "x-forwarded-for": "203.0.113.10" }),
        ["127.0.0.1"],
      ),
    ).toBe(false);
  });

  it("bypasses token auth for loopback with non-standard Host", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "token", token: "secret", allowTailscale: false },
      connectAuth: null,
      req: makeReq("127.0.0.1", "0.0.0.0:19001"),
    });
    expect(res.ok).toBe(true);
    expect(res.method).toBe("shared_secret");
  });

  it("bypasses password auth for loopback with missing Host", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "password", password: "secret", allowTailscale: false },
      connectAuth: null,
      req: makeReq("127.0.0.1"),
    });
    expect(res.ok).toBe(true);
    expect(res.method).toBe("shared_secret");
  });
});

describe("BAXBOT env var resolution", () => {
  it("resolves token/password from BAXBOT gateway env vars", () => {
    expect(
      resolveGatewayAuth({
        authConfig: {},
        env: {
          BAXBOT_GATEWAY_TOKEN: "baxbot-token",
          BAXBOT_GATEWAY_PASSWORD: "baxbot-password",
        } as NodeJS.ProcessEnv,
      }),
    ).toMatchObject({
      mode: "password",
      token: "baxbot-token",
      password: "baxbot-password",
    });
  });

  it("prefers BAXBOT env vars over OPENCLAW env vars", () => {
    expect(
      resolveGatewayAuth({
        authConfig: {},
        env: {
          BAXBOT_GATEWAY_TOKEN: "baxbot-token",
          OPENCLAW_GATEWAY_TOKEN: "openclaw-token",
        } as NodeJS.ProcessEnv,
      }),
    ).toMatchObject({
      mode: "token",
      token: "baxbot-token",
    });
  });

  it("falls back to OPENCLAW env vars when BAXBOT vars absent", () => {
    expect(
      resolveGatewayAuth({
        authConfig: {},
        env: {
          OPENCLAW_GATEWAY_TOKEN: "openclaw-token",
        } as NodeJS.ProcessEnv,
      }),
    ).toMatchObject({
      mode: "token",
      token: "openclaw-token",
    });
  });
});

describe("trusted-proxy auth", () => {
  type GatewayConnectInput = Parameters<typeof authorizeGatewayConnect>[0];
  const trustedProxyConfig = {
    userHeader: "x-forwarded-user",
    requiredHeaders: ["x-forwarded-proto"],
    allowUsers: [],
  };

  function authorizeTrustedProxy(options?: {
    auth?: GatewayConnectInput["auth"];
    trustedProxies?: string[];
    remoteAddress?: string;
    headers?: Record<string, string>;
  }) {
    return authorizeGatewayConnect({
      auth: options?.auth ?? {
        mode: "trusted-proxy",
        allowTailscale: false,
        trustedProxy: trustedProxyConfig,
      },
      connectAuth: null,
      trustedProxies: options?.trustedProxies ?? ["10.0.0.1"],
      req: {
        socket: { remoteAddress: options?.remoteAddress ?? "10.0.0.1" },
        headers: {
          host: "gateway.local",
          ...options?.headers,
        },
      } as never,
    });
  }

  it("accepts valid request from trusted proxy", async () => {
    const res = await authorizeTrustedProxy({
      headers: {
        "x-forwarded-user": "nick@example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("trusted-proxy");
    expect(res.user).toBe("nick@example.com");
  });

  it("rejects request from untrusted source", async () => {
    const res = await authorizeTrustedProxy({
      remoteAddress: "192.168.1.100",
      headers: {
        "x-forwarded-user": "attacker@evil.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("trusted_proxy_untrusted_source");
  });

  it("rejects request with missing user header", async () => {
    const res = await authorizeTrustedProxy({
      headers: {
        "x-forwarded-proto": "https",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("trusted_proxy_user_missing");
  });

  it("rejects request with missing required headers", async () => {
    const res = await authorizeTrustedProxy({
      headers: {
        "x-forwarded-user": "nick@example.com",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("trusted_proxy_missing_header_x-forwarded-proto");
  });

  it("rejects user not in allowlist", async () => {
    const res = await authorizeTrustedProxy({
      auth: {
        mode: "trusted-proxy",
        allowTailscale: false,
        trustedProxy: {
          userHeader: "x-forwarded-user",
          allowUsers: ["admin@example.com", "nick@example.com"],
        },
      },
      headers: {
        "x-forwarded-user": "stranger@other.com",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("trusted_proxy_user_not_allowed");
  });

  it("accepts user in allowlist", async () => {
    const res = await authorizeTrustedProxy({
      auth: {
        mode: "trusted-proxy",
        allowTailscale: false,
        trustedProxy: {
          userHeader: "x-forwarded-user",
          allowUsers: ["admin@example.com", "nick@example.com"],
        },
      },
      headers: {
        "x-forwarded-user": "nick@example.com",
      },
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("trusted-proxy");
    expect(res.user).toBe("nick@example.com");
  });

  it("rejects when no trustedProxies configured", async () => {
    const res = await authorizeTrustedProxy({
      trustedProxies: [],
      headers: {
        "x-forwarded-user": "nick@example.com",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("trusted_proxy_no_proxies_configured");
  });

  it("rejects when trustedProxy config missing", async () => {
    const res = await authorizeTrustedProxy({
      auth: {
        mode: "trusted-proxy",
        allowTailscale: false,
      },
      headers: {
        "x-forwarded-user": "nick@example.com",
      },
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toBe("trusted_proxy_config_missing");
  });

  it("supports Pomerium-style headers", async () => {
    const res = await authorizeTrustedProxy({
      auth: {
        mode: "trusted-proxy",
        allowTailscale: false,
        trustedProxy: {
          userHeader: "x-pomerium-claim-email",
          requiredHeaders: ["x-pomerium-jwt-assertion"],
        },
      },
      trustedProxies: ["172.17.0.1"],
      remoteAddress: "172.17.0.1",
      headers: {
        "x-pomerium-claim-email": "nick@example.com",
        "x-pomerium-jwt-assertion": "eyJ...",
      },
    });

    expect(res.ok).toBe(true);
    expect(res.method).toBe("trusted-proxy");
    expect(res.user).toBe("nick@example.com");
  });

  it("trims whitespace from user header value", async () => {
    const res = await authorizeTrustedProxy({
      auth: {
        mode: "trusted-proxy",
        allowTailscale: false,
        trustedProxy: {
          userHeader: "x-forwarded-user",
        },
      },
      headers: {
        "x-forwarded-user": "  nick@example.com  ",
      },
    });

    expect(res.ok).toBe(true);
    expect(res.user).toBe("nick@example.com");
  });
});
