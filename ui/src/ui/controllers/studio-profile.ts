const PROFILE_KEY = "cullmate.studio-profile.v1";

export type StudioProfile = {
  enabled: boolean;
  displayName: string; // photographer name
  studioName: string;
  website: string;
  instagram: string;
  city: string;
  copyrightLine: string;
  completedSetup: boolean; // so we only prompt once
};

const DEFAULTS: StudioProfile = {
  enabled: false,
  displayName: "",
  studioName: "",
  website: "",
  instagram: "",
  city: "",
  copyrightLine: "",
  completedSetup: false,
};

/**
 * Load the StudioProfile from localStorage.
 * On first load, migrates from the old UiSettings copyright fields if present.
 */
export function loadStudioProfile(): StudioProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StudioProfile>;
      return {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULTS.enabled,
        displayName:
          typeof parsed.displayName === "string" ? parsed.displayName : DEFAULTS.displayName,
        studioName: typeof parsed.studioName === "string" ? parsed.studioName : DEFAULTS.studioName,
        website: typeof parsed.website === "string" ? parsed.website : DEFAULTS.website,
        instagram: typeof parsed.instagram === "string" ? parsed.instagram : DEFAULTS.instagram,
        city: typeof parsed.city === "string" ? parsed.city : DEFAULTS.city,
        copyrightLine:
          typeof parsed.copyrightLine === "string" ? parsed.copyrightLine : DEFAULTS.copyrightLine,
        completedSetup:
          typeof parsed.completedSetup === "boolean"
            ? parsed.completedSetup
            : DEFAULTS.completedSetup,
      };
    }

    // Migration: read old UiSettings copyright fields
    return migrateFromLegacySettings();
  } catch {
    return DEFAULTS;
  }
}

export function saveStudioProfile(profile: StudioProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// ── Legacy migration ──

function migrateFromLegacySettings(): StudioProfile {
  try {
    const settingsRaw = localStorage.getItem("openclaw.control.settings.v1");
    if (!settingsRaw) {
      return DEFAULTS;
    }
    const settings = JSON.parse(settingsRaw) as Record<string, unknown>;
    const hadCopyright =
      typeof settings.copyrightEnabled === "boolean" && settings.copyrightEnabled;
    const name = typeof settings.copyrightName === "string" ? settings.copyrightName : "";
    const studio = typeof settings.copyrightStudio === "string" ? settings.copyrightStudio : "";
    const website = typeof settings.copyrightWebsite === "string" ? settings.copyrightWebsite : "";

    if (!hadCopyright && !name && !studio && !website) {
      return DEFAULTS;
    }

    // Build migrated profile
    const migrated: StudioProfile = {
      enabled: hadCopyright,
      displayName: name,
      studioName: studio,
      website,
      instagram: "",
      city: "",
      copyrightLine: name ? `\u00A9 ${new Date().getFullYear()} ${name}` : "",
      completedSetup: true, // they already set it up, don't prompt again
    };

    // Persist the migrated profile
    saveStudioProfile(migrated);
    return migrated;
  } catch {
    return DEFAULTS;
  }
}
