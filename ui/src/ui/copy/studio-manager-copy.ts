export const COPY = {
  // First-boot greeting
  welcomeGreeting: "Hi \u2014 I'll save your photos safely and keep each job organized.",

  // Setup cards (first boot)
  storageTitle: "Where should I save your photos?",
  storageButton: "Set up storage",
  organizationTitle: "How should I organize each job?",
  organizationChooseButton: "Choose a template",
  organizationDescribeButton: "Describe it",
  readyToImport: "Ready to save your first card.",

  // Returning user
  detectedSourceBody: (label: string) => `Card detected: ${label}`,
  savePhotosSafely: "Save photos safely",
  notNow: "Not now",
  recentTitle: "Recent Projects",
  recentDescription: "Pick up where you left off.",
  readyWhenYouAre: "Ready when you are.",

  // Status (future commit wiring, but strings defined now)
  statusScanning: "Looking for photos\u2026",
  statusCopying: "Copying photos\u2026",
  statusVerifying: "Double-checking everything is safe\u2026",
  statusDone: "All done!",

  // Result card
  safeToFormatYes: "Safe to format cards",
  safeToFormatNotYet: "Not yet safe to format",
  safeToFormatYesDetail: "Every photo was copied and double-checked. Your backup is ready too.",
  safeToFormatNoDetail:
    "Something went wrong during the copy. Check the Safety Report for details.",
  openSafetyReport: "Open Safety Report",
  openInFinder: "Show in Finder",
  importToLightroom: "Import to Lightroom",

  // Affordances
  showDetails: "Show details",
  hideDetails: "Hide details",
  disconnectedMessage: "Connecting to Cullmate\u2026",
} as const;
