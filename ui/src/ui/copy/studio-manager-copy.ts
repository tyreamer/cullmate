export const COPY = {
  // First-boot greeting
  welcomeGreeting: "Hey! I'll keep your photos safe and organized \u2014 you focus on shooting.",

  // Setup cards (first boot)
  storageTitle: "Where should I save your photos?",
  storageButton: "Choose a folder",
  storageDone: "Nice \u2014 storage is set up.",
  organizationTitle: "How should I organize each job?",
  organizationChooseButton: "Choose a template",
  organizationDescribeButton: "Describe it",
  readyToImport: "Ready to save your first card.",

  // Studio Profile onboarding
  profilePrompt:
    "Want copyright info added to your files? It's invisible metadata \u2014 only editing apps see it.",
  profileTitle: "Copyright metadata",
  profileButton: "Set it up",
  profileSkip: "Not now",
  profileDone: "Profile saved.",

  // Returning user
  detectedSourceBody: (label: string) => `Found your card \u2014 ${label}`,
  savePhotosSafely: "Save photos safely",
  notNow: "Not now",
  recentTitle: "Recent Projects",
  recentDescription: "Pick up where you left off.",
  readyWhenYouAre: "Ready when you are.",

  // Status
  statusScanning: "Looking for photos\u2026",
  statusCopying: "Copying photos\u2026",
  statusVerifying: "Double-checking everything\u2026",
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
  layoutPrompt: "How should I organize your files?",
  templatePickerSubtitle: "This is how folders will look inside each project.",
  layoutClassicButton: "Use Classic",

  // Studio Profile (inline optional question — NOT "Studio name on photos")
  profilePromptInline:
    "Want copyright info added to your files? It's invisible metadata \u2014 only editing apps see it. (Optional)",
  profileTitleInline: "Copyright metadata",
  profileDescription:
    "Adds your name and \u00A9 line to each photo's metadata. Lightroom and Capture One show it automatically.",
  profileTurnOn: "Set it up",
  profileNotNow: "Not now",

  // AI onboarding (inline optional question)
  aiPromptInline: "Want local AI features too? Optional — core imports work without AI.",
  aiTitleInline: "Local AI features",
  aiDescription:
    "Install and enable optional AI helpers during setup, or skip for now and do it later in Settings.",
  aiSetupNow: "Set up AI",
  aiNotNow: "Not now",

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

  // Completion
  startEditing: "Start Editing",
  openReviewFolder: "Open Review Folder",
  completionSafe: (n: number, bursts: number) =>
    `All ${n} photo${n === 1 ? "" : "s"} copied, verified, and backed up.${bursts > 0 ? ` Found ${bursts} burst${bursts === 1 ? "" : "s"} \u2014 picked the sharpest from each.` : ""} You're all set.`,
  completionUnsafe: (n: number, unreadable: number) =>
    `${n} photo${n === 1 ? "" : "s"} copied. ${unreadable} couldn\u2019t be read \u2014 they may be damaged. Check the review folder before formatting.`,
  burstsFound: (count: number, picks: number) =>
    `${count} burst${count === 1 ? "" : "s"} found, ${picks} best pick${picks === 1 ? "" : "s"} selected.`,
  statusAnalyzing: "Analyzing photos\u2026",

  // Import card
  importSubtitle: "Creates a Safety Report. Never deletes originals.",
  importChooseFolder: "Choose a folder\u2026",
  importSaveTo: "Save to",
  importChangeSaveTo: "Change\u2026",
  importAndVerify: "Import & Verify",
  importOptions: "Options",

  // Options
  optionsVerifyStandard: "Standard",
  optionsVerifyStandardDesc: "Verifies a sample after copy",
  optionsVerifyMax: "Maximum",
  optionsVerifyMaxDesc: "Verifies every file (slowest)",
  optionsVerifyFast: "Fast",
  optionsVerifyFastDesc: "No verification",
  optionsDuplicates: "Skip duplicates",
  optionsFolderLabel: "Folder structure",

  // 3-stage progress
  stageCopying: "Copying",
  stageVerifying: "Verifying",
  stageFinalizing: "Finalizing report",

  // Completion badges
  completionHeadline: "Import complete",
  completionCopies: (n: number) => `${n} ${n === 1 ? "copy" : "copies"} created`,
  completionReceipt: "Receipt saved",
  completionShowFinder: "Show in Finder",
  completionOpenLR: "Open in Lightroom",
  completionEject: "Eject card",

  // Affordances
  showDetails: "Show details",
  hideDetails: "Hide details",
  disconnectedMessage: "Connecting to BaxBot\u2026",
  connectionErrorTitle: "Can\u2019t connect to BaxBot",
  openSettings: "Open Settings",

  // Diagnostics (Help section in Settings)
  diagnosticsTitle: "Help",
  diagnosticsButton: "Export diagnostics\u2026",
  diagnosticsExporting: "Saving\u2026",
  diagnosticsDescription:
    "Creates a file with app info and recent logs. No photos or personal data are included.",
} as const;
