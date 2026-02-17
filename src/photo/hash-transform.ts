import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { Transform, type TransformCallback, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

type Hasher = {
  update(buf: Buffer | Uint8Array): void;
  digestHex(): string;
};

export function createHasher(algo: string): Hasher {
  if (algo === "blake3") {
    // Dynamic import handled in hashFile / HashTransform constructor
    // For blake3, we wrap the hash instance lazily
    throw new Error("Use createHasherAsync for blake3");
  }
  const hash = crypto.createHash(algo);
  return {
    update(buf) {
      hash.update(buf);
    },
    digestHex() {
      return hash.digest("hex");
    },
  };
}

export async function createHasherAsync(algo: string): Promise<Hasher> {
  if (algo === "blake3") {
    const blake3 = await import("blake3");
    const hash = blake3.createHash();
    return {
      update(buf) {
        hash.update(buf);
      },
      digestHex() {
        return hash.digest("hex");
      },
    };
  }
  return createHasher(algo);
}

/**
 * Transform stream that passes data through unchanged while computing a hash.
 */
export class HashTransform extends Transform {
  private hasher: Hasher | null = null;
  private readonly algo: string;
  private readonly initPromise: Promise<void>;
  private pendingChunks: { chunk: Buffer; callback: TransformCallback }[] = [];

  constructor(algo: string) {
    super();
    this.algo = algo;
    this.initPromise = this.initHasher();
  }

  private async initHasher(): Promise<void> {
    this.hasher = await createHasherAsync(this.algo);
    // Flush any pending chunks
    for (const { chunk, callback } of this.pendingChunks) {
      this.hasher.update(chunk);
      this.push(chunk);
      callback();
    }
    this.pendingChunks = [];
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.hasher) {
      this.hasher.update(chunk);
      this.push(chunk);
      callback();
    } else {
      // Queue chunks until hasher is ready
      this.pendingChunks.push({ chunk, callback });
      void this.initPromise;
    }
  }

  digestHex(): string {
    if (!this.hasher) {
      throw new Error("Hash not yet initialized");
    }
    return this.hasher.digestHex();
  }

  /** Wait for hasher init (useful before calling digestHex after pipeline completes) */
  async ready(): Promise<void> {
    await this.initPromise;
  }
}

/**
 * Hash a file by streaming it through a hasher. Returns hex digest.
 */
export async function hashFile(filePath: string, algo: string): Promise<string> {
  const hasher = await createHasherAsync(algo);
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      hasher.update(chunk);
      callback();
    },
  });
  await pipeline(createReadStream(filePath), sink);
  return hasher.digestHex();
}
