export const COPY = {
  // First-boot greeting
  welcomeGreeting: "Hi \u2014 I'll save your photos safely and keep each job organized.",

  // Setup cards (first boot)
  storageTitle: "Where should I save your photos?",
  storageButton: "Set up storage",
  storageDone: "Storage is set up. One more step.",
  organizationTitle: "How should I organize each job?",
  organizationChooseButton: "Choose a template",
  organizationDescribeButton: "Describe it",
  readyToImport: "Ready to save your first card.",

  // Studio Profile onboarding
  profilePrompt: "Want to add your name + website to photos? Helps with sharing later.",
  profileTitle: "Add Studio Profile",
  profileButton: "Add Studio Profile",
  profileSkip: "Skip",
  profileDone: "Profile saved.",

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
  openFolder: "Open folder",
  openInFinder: "Show in Finder",
  importToLightroom: "Import to Lightroom",

  // Layout (inline onboarding)
  layoutPrompt: "Pick a layout for your files",
  layoutClassicButton: "Use Classic",

  // Studio Profile (inline optional question)
  profilePromptInline: "Want your studio name added automatically? (Optional)",
  profileTitleInline: "Studio name on photos",
  profileTurnOn: "Turn it on",
  profileNotNow: "Not now",

  // Naming step
  namingPrompt: "What\u2019s this shoot called?",
  namingTitle: "Name this project",
  namingPlaceholder: "e.g. Josh & Kelly \u2014 Swan Point",
  savePhotosButton: "Save photos",

  // Triage results
  triageUnreadable: (n: number) => `${n} file${n === 1 ? "" : "s"} may be damaged`,
  triageBlackFrames: (n: number) => `${n} possible junk frame${n === 1 ? "" : "s"}`,
  triageShowUnreadable: "Show unreadable files",
  triageShowJunk: "Show junk candidates",
  triageClean: "All files look good",

  // Affordances
  showDetails: "Show details",
  hideDetails: "Hide details",
  disconnectedMessage: "Connecting to BaxBot\u2026",
} as const;
