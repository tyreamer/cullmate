import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import { ALL_PRESETS } from "../../../../src/photo/template-presets.js";

const TEMPLATE_KEY = "cullmate.folder.template";

export function loadFolderTemplate(): FolderTemplate | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as FolderTemplate;
  } catch {
    return null;
  }
}

export function saveFolderTemplate(t: FolderTemplate): void {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t));
}

export function clearFolderTemplate(): void {
  localStorage.removeItem(TEMPLATE_KEY);
}

export { ALL_PRESETS };
