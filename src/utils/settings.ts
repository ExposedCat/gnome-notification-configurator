import type Gio from "gi://Gio?version=2.0";

import type { Notification } from "@girs/gnome-shell/ui/messageTray";
import type { NotificationTheme } from "./constants.js";
import { DEFAULT_THEME } from "./constants.js";
import { TypedEventEmitter } from "./event-emitter.js";

export type Position = "fill" | "left" | "right" | "center";

export type Matcher = {
  title: string;
  body: string;
  appName: string;
};

type FilterAction = "hide" | "close";

export type Configuration = {
  enabled: boolean;
  rateLimiting: {
    enabled: boolean;
    notificationThreshold: number;
  };
  timeout: {
    enabled: boolean;
    notificationTimeout: number;
    ignoreIdle: boolean;
  };
  urgency: {
    alwaysNormalUrgency: boolean;
  };
  display: {
    enableFullscreen: boolean;
    notificationPosition: Position;
  };
  colors: {
    enabled: boolean;
    theme: NotificationTheme;
  };
};

export type PatternOverrides = {
  rateLimiting: boolean;
  timeout: boolean;
  urgency: boolean;
  colors: boolean;
};

export type PatternConfigurationPrefs = {
  shortName: string;
  matcher: Matcher;
  overrides: PatternOverrides;
  filtering: {
    enabled: boolean;
    action: FilterAction;
  };
};

export type GlobalConfiguration = Configuration;
export type PatternConfiguration = Configuration & PatternConfigurationPrefs;

type SettingsEvents = {
  colorsEnabledChanged: [boolean];
  rateLimitingEnabledChanged: [boolean];
  filteringEnabledChanged: [boolean];
  notificationThresholdChanged: [number];
  notificationPositionChanged: [Position];
  fullscreenEnabledChanged: [boolean];
  notificationTimeoutChanged: [number];
  ignoreIdleChanged: [boolean];
  alwaysNormalUrgencyChanged: [boolean];
};

export class SettingsManager {
  private settings: Gio.Settings;
  private settingSignals: number[] = [];

  private _colorsEnabled = true;
  private _rateLimitingEnabled = true;
  private _filteringEnabled = false;
  private _fullscreenEnabled = false;
  private _notificationThreshold = 5000;
  private _notificationTimeout = 4000;
  private _ignoreIdle = true;
  private _alwaysNormalUrgency = false;
  private _globalConfiguration: GlobalConfiguration =
    SettingsManager.defaultGlobalConfiguration();
  private _patterns: PatternConfiguration[] = [];

  events = new TypedEventEmitter<SettingsEvents>();

  constructor(settings: Gio.Settings) {
    this.settings = settings;
    this.listen();
    this.load();
  }

  static defaultGlobalConfiguration(): GlobalConfiguration {
    return {
      enabled: true,
      rateLimiting: {
        enabled: true,
        notificationThreshold: 5000,
      },
      timeout: {
        enabled: true,
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
      colors: {
        enabled: true,
        theme: {
          ...DEFAULT_THEME,
        },
      },
    };
  }

  dispose() {
    for (const signal of this.settingSignals) {
      this.settings.disconnect(signal);
    }
  }

  get colorsEnabled() {
    return this._colorsEnabled;
  }

  get rateLimitingEnabled() {
    return this._rateLimitingEnabled;
  }

  get filteringEnabled() {
    return this._filteringEnabled;
  }

  get fullscreenEnabled() {
    return this._fullscreenEnabled;
  }

  get notificationThreshold() {
    return this._notificationThreshold;
  }

  get notificationTimeout() {
    return this._notificationTimeout;
  }

  get ignoreIdle() {
    return this._ignoreIdle;
  }

  get alwaysNormalUrgency() {
    return this._alwaysNormalUrgency;
  }

  get notificationPosition() {
    return this._globalConfiguration.display.notificationPosition;
  }

  getFilterFor(
    notification: Notification,
    source: string,
  ): FilterAction | null {
    for (const pattern of this._patterns) {
      if (!pattern.enabled || !pattern.filtering.enabled) {
        continue;
      }
      if (this.matchesPattern(pattern.matcher, notification, source)) {
        return pattern.filtering.action;
      }
    }
    return null;
  }

  isValidRegexPattern(pattern: string): boolean {
    if (!pattern.trim()) {
      return true;
    }
    try {
      new RegExp(pattern, "i");
      return true;
    } catch {
      return false;
    }
  }

  getThemeFor(appName: string) {
    for (const pattern of this._patterns) {
      if (
        !pattern.enabled ||
        !pattern.overrides.colors ||
        !pattern.colors.enabled
      ) {
        continue;
      }
      if (pattern.matcher.title.trim() || pattern.matcher.body.trim()) {
        continue;
      }
      if (
        pattern.matcher.appName.trim() &&
        this.matchesRegex(appName, pattern.matcher.appName)
      ) {
        return pattern.colors.theme;
      }
    }
    if (this._globalConfiguration.colors.enabled) {
      return this._globalConfiguration.colors.theme;
    }
    return undefined;
  }

  getConfigurationForNotification(
    notification: Notification,
    source: string,
  ): Configuration {
    const matchedPattern = this.findMatchingPattern(notification, source);
    if (!matchedPattern || !matchedPattern.enabled) {
      return this._globalConfiguration;
    }
    const overrides = matchedPattern.overrides;
    return {
      ...this._globalConfiguration,
      enabled: matchedPattern.enabled,
      rateLimiting: overrides.rateLimiting
        ? matchedPattern.rateLimiting
        : this._globalConfiguration.rateLimiting,
      timeout: overrides.timeout
        ? matchedPattern.timeout
        : this._globalConfiguration.timeout,
      urgency: overrides.urgency
        ? matchedPattern.urgency
        : this._globalConfiguration.urgency,
      display: this._globalConfiguration.display,
      colors: overrides.colors
        ? matchedPattern.colors
        : this._globalConfiguration.colors,
    };
  }

  private load() {
    this._globalConfiguration = this.parseGlobalConfiguration(
      this.settings.get_string("global"),
    );
    this._patterns = this.parsePatternConfigurations(
      this.settings.get_string("patterns"),
    );
    this._colorsEnabled =
      this._globalConfiguration.colors.enabled ||
      this._patterns.some(
        (pattern) =>
          pattern.enabled && pattern.overrides.colors && pattern.colors.enabled,
      );
    this._rateLimitingEnabled =
      this._globalConfiguration.rateLimiting.enabled ||
      this._patterns.some(
        (pattern) =>
          pattern.enabled &&
          pattern.overrides.rateLimiting &&
          pattern.rateLimiting.enabled,
      );
    this._filteringEnabled = this._patterns.some(
      (pattern) => pattern.enabled && pattern.filtering.enabled,
    );
    this._fullscreenEnabled =
      this._globalConfiguration.display.enableFullscreen;
    this._notificationThreshold =
      this._globalConfiguration.rateLimiting.notificationThreshold;
    this._notificationTimeout =
      this._globalConfiguration.timeout.notificationTimeout;
    this._ignoreIdle = this._globalConfiguration.timeout.ignoreIdle;
    this._alwaysNormalUrgency =
      this._globalConfiguration.urgency.alwaysNormalUrgency;
  }

  private listen() {
    const emitChanges = () => {
      this.events.emit("colorsEnabledChanged", this._colorsEnabled);
      this.events.emit("rateLimitingEnabledChanged", this._rateLimitingEnabled);
      this.events.emit("filteringEnabledChanged", this._filteringEnabled);
      this.events.emit(
        "notificationThresholdChanged",
        this._notificationThreshold,
      );
      this.events.emit(
        "notificationPositionChanged",
        this.notificationPosition,
      );
      this.events.emit("fullscreenEnabledChanged", this._fullscreenEnabled);
      this.events.emit("notificationTimeoutChanged", this._notificationTimeout);
      this.events.emit("ignoreIdleChanged", this._ignoreIdle);
      this.events.emit("alwaysNormalUrgencyChanged", this._alwaysNormalUrgency);
    };

    this.settingSignals.push(
      this.settings.connect("changed::global", () => {
        this.load();
        emitChanges();
      }),
    );
    this.settingSignals.push(
      this.settings.connect("changed::patterns", () => {
        this.load();
        emitChanges();
      }),
    );
  }

  private parseGlobalConfiguration(value: string): GlobalConfiguration {
    try {
      const parsed = JSON.parse(value) as Partial<GlobalConfiguration>;
      return {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
        rateLimiting: {
          enabled:
            typeof parsed.rateLimiting?.enabled === "boolean"
              ? parsed.rateLimiting.enabled
              : true,
          notificationThreshold:
            typeof parsed.rateLimiting?.notificationThreshold === "number"
              ? parsed.rateLimiting.notificationThreshold
              : 5000,
        },
        timeout: {
          enabled:
            typeof parsed.timeout?.enabled === "boolean"
              ? parsed.timeout.enabled
              : true,
          notificationTimeout:
            typeof parsed.timeout?.notificationTimeout === "number"
              ? parsed.timeout.notificationTimeout
              : 4000,
          ignoreIdle:
            typeof parsed.timeout?.ignoreIdle === "boolean"
              ? parsed.timeout.ignoreIdle
              : true,
        },
        urgency: {
          alwaysNormalUrgency:
            typeof parsed.urgency?.alwaysNormalUrgency === "boolean"
              ? parsed.urgency.alwaysNormalUrgency
              : false,
        },
        display: {
          enableFullscreen:
            typeof parsed.display?.enableFullscreen === "boolean"
              ? parsed.display.enableFullscreen
              : false,
          notificationPosition: this.normalizePosition(
            parsed.display?.notificationPosition,
          ),
        },
        colors: {
          enabled:
            typeof parsed.colors?.enabled === "boolean"
              ? parsed.colors.enabled
              : true,
          theme: this.normalizeTheme(parsed.colors?.theme),
        },
      };
    } catch {
      return SettingsManager.defaultGlobalConfiguration();
    }
  }

  private parsePatternConfigurations(value: string): PatternConfiguration[] {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const patterns: PatternConfiguration[] = [];
      for (const candidate of parsed) {
        patterns.push(this.normalizePattern(candidate));
      }
      return patterns;
    } catch {
      return [];
    }
  }

  private normalizePattern(candidate: unknown): PatternConfiguration {
    const object = (candidate ?? {}) as Partial<PatternConfiguration>;
    return {
      enabled: typeof object.enabled === "boolean" ? object.enabled : true,
      shortName: typeof object.shortName === "string" ? object.shortName : "",
      matcher: {
        title:
          typeof object.matcher?.title === "string" ? object.matcher.title : "",
        body:
          typeof object.matcher?.body === "string" ? object.matcher.body : "",
        appName:
          typeof object.matcher?.appName === "string"
            ? object.matcher.appName
            : "",
      },
      overrides: {
        rateLimiting:
          typeof object.overrides?.rateLimiting === "boolean"
            ? object.overrides.rateLimiting
            : false,
        timeout:
          typeof object.overrides?.timeout === "boolean"
            ? object.overrides.timeout
            : false,
        urgency:
          typeof object.overrides?.urgency === "boolean"
            ? object.overrides.urgency
            : false,
        colors:
          typeof object.overrides?.colors === "boolean"
            ? object.overrides.colors
            : false,
      },
      rateLimiting: {
        enabled:
          typeof object.rateLimiting?.enabled === "boolean"
            ? object.rateLimiting.enabled
            : false,
        notificationThreshold:
          typeof object.rateLimiting?.notificationThreshold === "number"
            ? object.rateLimiting.notificationThreshold
            : 5000,
      },
      timeout: {
        enabled:
          typeof object.timeout?.enabled === "boolean"
            ? object.timeout.enabled
            : false,
        notificationTimeout:
          typeof object.timeout?.notificationTimeout === "number"
            ? object.timeout.notificationTimeout
            : 4000,
        ignoreIdle:
          typeof object.timeout?.ignoreIdle === "boolean"
            ? object.timeout.ignoreIdle
            : true,
      },
      urgency: {
        alwaysNormalUrgency:
          typeof object.urgency?.alwaysNormalUrgency === "boolean"
            ? object.urgency.alwaysNormalUrgency
            : false,
      },
      display: {
        enableFullscreen:
          typeof object.display?.enableFullscreen === "boolean"
            ? object.display.enableFullscreen
            : false,
        notificationPosition: this.normalizePosition(
          object.display?.notificationPosition,
        ),
      },
      filtering: {
        enabled:
          typeof object.filtering?.enabled === "boolean"
            ? object.filtering.enabled
            : false,
        action: this.normalizeFilterAction(object.filtering?.action),
      },
      colors: {
        enabled:
          typeof object.colors?.enabled === "boolean"
            ? object.colors.enabled
            : false,
        theme: this.normalizeTheme(object.colors?.theme),
      },
    };
  }

  private normalizeFilterAction(value: unknown): FilterAction {
    return value === "close" ? "close" : "hide";
  }

  private normalizePosition(value: unknown): Position {
    return value === "fill" || value === "left" || value === "right"
      ? value
      : "center";
  }

  private normalizeTheme(theme: unknown): NotificationTheme {
    const candidate = (theme ?? {}) as Partial<NotificationTheme>;
    return {
      appNameColor: this.normalizeColor(
        candidate.appNameColor,
        DEFAULT_THEME.appNameColor,
      ),
      timeColor: this.normalizeColor(
        candidate.timeColor,
        DEFAULT_THEME.timeColor,
      ),
      backgroundColor: this.normalizeColor(
        candidate.backgroundColor,
        DEFAULT_THEME.backgroundColor,
      ),
      titleColor: this.normalizeColor(
        candidate.titleColor,
        DEFAULT_THEME.titleColor,
      ),
      bodyColor: this.normalizeColor(
        candidate.bodyColor,
        DEFAULT_THEME.bodyColor,
      ),
      appNameFontSize: this.normalizeNumber(
        candidate.appNameFontSize,
        DEFAULT_THEME.appNameFontSize,
      ),
      timeFontSize: this.normalizeNumber(
        candidate.timeFontSize,
        DEFAULT_THEME.timeFontSize,
      ),
      titleFontSize: this.normalizeNumber(
        candidate.titleFontSize,
        DEFAULT_THEME.titleFontSize,
      ),
      bodyFontSize: this.normalizeNumber(
        candidate.bodyFontSize,
        DEFAULT_THEME.bodyFontSize,
      ),
    };
  }

  private normalizeColor(candidate: unknown, fallback: number[]): number[] {
    if (!Array.isArray(candidate) || candidate.length !== 4) {
      return [...fallback];
    }
    const normalizedColor: number[] = [];
    for (const [index, value] of candidate.entries()) {
      normalizedColor.push(this.normalizeNumber(value, fallback[index]));
    }
    return normalizedColor;
  }

  private normalizeNumber(candidate: unknown, fallback: number): number {
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? candidate
      : fallback;
  }

  private findMatchingPattern(
    notification: Notification,
    source: string,
  ): PatternConfiguration | null {
    for (const pattern of this._patterns) {
      if (!pattern.enabled) {
        continue;
      }
      if (this.matchesPattern(pattern.matcher, notification, source)) {
        return pattern;
      }
    }
    return null;
  }

  private matchesPattern(
    matcher: Matcher,
    notification: Notification,
    source: string,
  ): boolean {
    const notificationTitle = notification.title ?? "";
    const notificationBody = notification.body ?? "";
    const titleMatches =
      !matcher.title.trim() ||
      (Boolean(notificationTitle.trim()) &&
        this.matchesRegex(notificationTitle, matcher.title));
    const bodyMatches =
      !matcher.body.trim() ||
      (Boolean(notificationBody.trim()) &&
        this.matchesRegex(notificationBody, matcher.body));
    const appNameMatches =
      !matcher.appName.trim() ||
      (Boolean(source.trim()) && this.matchesRegex(source, matcher.appName));
    return titleMatches && bodyMatches && appNameMatches;
  }

  private matchesRegex(text: string, pattern: string): boolean {
    if (!pattern.trim()) {
      return false;
    }
    try {
      const regex = new RegExp(pattern, "i");
      return regex.test(text);
    } catch {
      return false;
    }
  }
}
