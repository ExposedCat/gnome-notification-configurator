import type Gio from "gi://Gio";

import { DEFAULT_THEME } from "../utils/constants.js";
import {
  normalizeAction,
  normalizePosition,
  normalizeTheme,
} from "../utils/normalize.js";
import type {
  GlobalConfiguration,
  Matcher,
  PatternConfiguration,
} from "../utils/settings.js";
import { SettingsManager } from "../utils/settings.js";

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
    notificationCenter: {
      disableGrouping: false,
    },
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
      notificationPosition: normalizePosition(
        oldSettings.get_string("notification-position"),
      ),
      verticalPosition: "top",
      hideAppTitleRow: false,
    },
    colors: {
      enabled: oldSettings.get_boolean("enable-custom-colors"),
      theme: {
        ...DEFAULT_THEME,
      },
    },
    margins: {
      enabled: false,
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    windowAttention: {
      activateInstead: false,
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
    pattern.filtering.action = normalizeAction(candidate.action);
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

  const created = SettingsManager.defaultPatternConfiguration(matcher);
  patternsByMatcher.set(matcherKey, created);
  return created;
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
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
