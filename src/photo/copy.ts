import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FileStatus } from "./types.js";
import { HashTransform } from "./hash-transform.js";

export type CopyResult = {
  hash: string;
  bytes: number;
  status: FileStatus;
  error?: string;
};

export async function copyFileWithHash(opts: {
  src: string;
  dst: string;
  hash_algo: string;
  overwrite: boolean;
}): Promise<CopyResult> {
  const { src, dst, hash_algo, overwrite } = opts;

  // Check if destination exists
  if (!overwrite) {
    try {
      await fs.access(dst);
      const stat = await fs.stat(dst);
      return { hash: "", bytes: stat.size, status: "skipped_exists" };
    } catch {
      // File doesn't exist, proceed with copy
    }
  }

  const partial = dst + ".partial";

  try {
    // Ensure destination directory exists
    await fs.mkdir(path.dirname(dst), { recursive: true, mode: 0o700 });

    const stat = await fs.stat(src);
    const ht = new HashTransform(hash_algo);

    await pipeline(createReadStream(src), ht, createWriteStream(partial, { mode: 0o600 }));

    await ht.ready();

    // Atomic rename
    await fs.rename(partial, dst);

    return {
      hash: ht.digestHex(),
      bytes: stat.size,
      status: "copied",
    };
  } catch (err) {
    // Clean up partial file on error
    try {
      await fs.unlink(partial);
    } catch {
      // Ignore cleanup errors
    }
    return {
      hash: "",
      bytes: 0,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
