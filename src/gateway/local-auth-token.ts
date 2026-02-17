import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TOKEN_FILENAME = "local-auth-token";

export function ensureLocalAuthToken(stateDir: string): string {
  const existing = readLocalAuthToken(stateDir);
  if (existing) {
    return existing;
  }
  fs.mkdirSync(stateDir, { recursive: true });
  const token = crypto.randomBytes(32).toString("hex");
  const tokenPath = path.join(stateDir, TOKEN_FILENAME);
  fs.writeFileSync(tokenPath, token + "\n", { mode: 0o600 });
  return token;
}

export function readLocalAuthToken(stateDir: string): string | null {
  const tokenPath = path.join(stateDir, TOKEN_FILENAME);
  try {
    const content = fs.readFileSync(tokenPath, "utf-8").trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}
