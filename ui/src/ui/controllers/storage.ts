const STORAGE_KEY = "cullmate.storage.config";

export type StorageConfig = {
  primaryDest: string;
  backupDest: string;
};

export function loadStorageConfig(): StorageConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.primaryDest === "string" &&
      parsed.primaryDest.trim() &&
      typeof parsed.backupDest === "string" &&
      parsed.backupDest.trim()
    ) {
      return { primaryDest: parsed.primaryDest, backupDest: parsed.backupDest };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveStorageConfig(cfg: StorageConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearStorageConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Turn a raw absolute path into a friendly display label. */
export function formatPathLabel(path: string): string {
  // /Volumes/<name>/DCIM  ->  "<name> (DCIM)"
  const volumeDcim = path.match(/^\/Volumes\/([^/]+)\/DCIM/);
  if (volumeDcim) {
    return `${volumeDcim[1]} (DCIM)`;
  }

  // /Volumes/<name>  ->  "<name>"
  const volume = path.match(/^\/Volumes\/([^/]+)/);
  if (volume) {
    return volume[1];
  }

  // ~/Pictures/Cullmate -> "Pictures/Cullmate"
  if (path.startsWith("~/")) {
    return path.slice(2);
  }

  // /Users/<user>/Pictures/... -> "Pictures/..."
  const userDir = path.match(/^\/Users\/[^/]+\/(.+)/);
  if (userDir) {
    return userDir[1];
  }

  // Fallback: last folder segment
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || path;
}

/**
 * Get the volume root for a path. Used for same-volume warnings.
 * /Volumes/<X>/... → /Volumes/<X>
 * Everything else → / (internal disk)
 */
export function getVolumeRoot(path: string): string {
  const match = path.match(/^(\/Volumes\/[^/]+)/);
  if (match) {
    return match[1];
  }
  return "/";
}
