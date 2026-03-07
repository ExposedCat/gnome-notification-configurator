import type Gio from "gi://Gio";

import { DEFAULT_THEME } from "../utils/constants.js";
import type {
  GlobalConfiguration,
  PatternConfiguration,
  Position,
} from "../utils/settings.js";

const OLD_KEYS = [
  "notification-threshold",
  "app-themes",
  "enable-rate-limiting",
  "enable-custom-colors",
  "enable-filtering",
  "enable-fullscreen",
  "notification-position",
  "block-list",
  "notification-timeout",
  "ignore-idle",
  "always-normal-urgency",
] as const;

type LegacyTheme = {
  appNameColor?: unknown;
  timeColor?: unknown;
  backgroundColor?: unknown;
  titleColor?: unknown;
  bodyColor?: unknown;
  appNameFontSize?: unknown;
  timeFontSize?: unknown;
  titleFontSize?: unknown;
  bodyFontSize?: unknown;
};

type LegacyFilter = {
  title?: unknown;
  body?: unknown;
  appName?: unknown;
  action?: unknown;
};

type Matcher = {
  title: string;
  body: string;
  appName: string;
};

export function migrateRegexSchema(currentSettings: Gio.Settings) {
  if (!shouldMigrate(currentSettings)) {
    return;
  }

  const global = createGlobalConfiguration(currentSettings);
  const patterns = createPatternConfigurations(currentSettings);

  currentSettings.set_string("global", JSON.stringify(global));
  currentSettings.set_string("patterns", JSON.stringify(patterns));
}

function shouldMigrate(currentSettings: Gio.Settings): boolean {
  const globalConfig = safeParseObject(currentSettings.get_string("global"));
  const patterns = safeParseArray(currentSettings.get_string("patterns"));

  if (
    (globalConfig !== null && Object.keys(globalConfig).length > 0) ||
    patterns.length > 0
  ) {
    return false;
  }

  for (const key of OLD_KEYS) {
    if (currentSettings.get_user_value(key) !== null) {
      return true;
    }
  }

  return false;
}

function createGlobalConfiguration(
  oldSettings: Gio.Settings,
): GlobalConfiguration {
  return {
    enabled: true,
    rateLimiting: {
      enabled: oldSettings.get_boolean("enable-rate-limiting"),
      notificationThreshold: oldSettings.get_int("notification-threshold"),
      action: "close",
    },
    timeout: {
      enabled: true,
      notificationTimeout: oldSettings.get_int("notification-timeout"),
      ignoreIdle: oldSettings.get_boolean("ignore-idle"),
    },
    urgency: {
      alwaysNormalUrgency: oldSettings.get_boolean("always-normal-urgency"),
    },
    display: {
      enableFullscreen: oldSettings.get_boolean("enable-fullscreen"),
      notificationPosition: asPosition(
        oldSettings.get_string("notification-position"),
      ),
    },
    colors: {
      enabled: oldSettings.get_boolean("enable-custom-colors"),
      theme: {
        ...DEFAULT_THEME,
      },
    },
  };
}

function createPatternConfigurations(
  oldSettings: Gio.Settings,
): PatternConfiguration[] {
  const patternsByMatcher = new Map<string, PatternConfiguration>();
  const filteringEnabled = oldSettings.get_boolean("enable-filtering");

  const appThemes = safeParseObject(
    oldSettings.get_string("app-themes"),
  ) as Record<string, LegacyTheme> | null;

  if (appThemes) {
    for (const [appName, legacyTheme] of Object.entries(appThemes)) {
      const matcher = { title: "", body: "", appName };
      const pattern = getOrCreatePattern(patternsByMatcher, matcher);
      pattern.overrides.colors = true;
      pattern.colors.enabled = true;
      pattern.colors.theme = normalizeTheme(legacyTheme);
      if (!pattern.shortName.trim()) {
        pattern.shortName = matcher.appName.trim();
      }
    }
  }

  const blockList = safeParseArray(oldSettings.get_string("block-list")) as
    | LegacyFilter[]
    | [];
  for (const candidate of blockList) {
    const matcher = {
      title: asString(candidate.title),
      body: asString(candidate.body),
      appName: asString(candidate.appName),
    };
    const pattern = getOrCreatePattern(patternsByMatcher, matcher);
    pattern.filtering.enabled = filteringEnabled;
    pattern.filtering.action = asFilterAction(candidate.action);
    if (!pattern.shortName.trim()) {
      pattern.shortName = createShortName(matcher);
    }
  }

  const patterns = [...patternsByMatcher.values()];
  for (const [index, pattern] of patterns.entries()) {
    if (!pattern.shortName.trim()) {
      pattern.shortName = `Pattern ${index + 1}`;
    }
  }

  return patterns;
}

function getOrCreatePattern(
  patternsByMatcher: Map<string, PatternConfiguration>,
  matcher: Matcher,
): PatternConfiguration {
  const matcherKey = buildMatcherKey(matcher);
  const existing = patternsByMatcher.get(matcherKey);
  if (existing) {
    return existing;
  }

  const created = createDefaultPattern(matcher);
  patternsByMatcher.set(matcherKey, created);
  return created;
}

function createDefaultPattern(matcher: Matcher): PatternConfiguration {
  return {
    enabled: true,
    shortName: createShortName(matcher),
    matcher,
    overrides: {
      rateLimiting: false,
      timeout: false,
      urgency: false,
      colors: false,
    },
    rateLimiting: {
      enabled: false,
      notificationThreshold: 5000,
      action: "close",
    },
    timeout: {
      enabled: false,
      notificationTimeout: 4000,
      ignoreIdle: true,
    },
    urgency: {
      alwaysNormalUrgency: false,
    },
    display: {
      enableFullscreen: false,
      notificationPosition: "center",
    },
    filtering: {
      enabled: false,
      action: "hide",
    },
    colors: {
      enabled: false,
      theme: {
        ...DEFAULT_THEME,
      },
    },
  };
}

function createShortName(matcher: Matcher): string {
  const candidates = [matcher.appName, matcher.title, matcher.body];
  for (const value of candidates) {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function buildMatcherKey(matcher: Matcher): string {
  return `${matcher.title}\u0000${matcher.body}\u0000${matcher.appName}`;
}

function normalizeTheme(candidate: LegacyTheme | null | undefined) {
  if (!candidate || typeof candidate !== "object") {
    return {
      ...DEFAULT_THEME,
    };
  }

  return {
    appNameColor: asColor(candidate.appNameColor, DEFAULT_THEME.appNameColor),
    timeColor: asColor(candidate.timeColor, DEFAULT_THEME.timeColor),
    backgroundColor: asColor(
      candidate.backgroundColor,
      DEFAULT_THEME.backgroundColor,
    ),
    titleColor: asColor(candidate.titleColor, DEFAULT_THEME.titleColor),
    bodyColor: asColor(candidate.bodyColor, DEFAULT_THEME.bodyColor),
    appNameFontSize: asNumber(
      candidate.appNameFontSize,
      DEFAULT_THEME.appNameFontSize,
    ),
    timeFontSize: asNumber(candidate.timeFontSize, DEFAULT_THEME.timeFontSize),
    titleFontSize: asNumber(
      candidate.titleFontSize,
      DEFAULT_THEME.titleFontSize,
    ),
    bodyFontSize: asNumber(candidate.bodyFontSize, DEFAULT_THEME.bodyFontSize),
  };
}

function asPosition(value: string): Position {
  if (value === "fill" || value === "left" || value === "right") {
    return value;
  }
  return "center";
}

function asFilterAction(value: unknown): "hide" | "close" {
  if (value === "hide" || value === "close") {
    return value;
  }
  return "hide";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asColor(
  value: unknown,
  fallback: number[],
): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    return [
      asNumber(fallback[0], 0),
      asNumber(fallback[1], 0),
      asNumber(fallback[2], 0),
      asNumber(fallback[3], 1),
    ];
  }

  const red = asNumber(value[0], fallback[0]);
  const green = asNumber(value[1], fallback[1]);
  const blue = asNumber(value[2], fallback[2]);
  const alpha = asNumber(value[3], fallback[3]);
  return [red, green, blue, alpha];
}

function safeParseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function safeParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}
