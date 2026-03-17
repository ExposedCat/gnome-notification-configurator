import type Gio from "gi://Gio?version=2.0";

import type { NotificationTheme } from "./constants.js";
import { DEFAULT_THEME } from "./constants.js";
import { TypedEventEmitter } from "./event-emitter.js";
import type {
  Margins,
  NotificationAction,
  Position,
  VerticalPosition,
} from "./normalize.js";
import {
  normalizeAction,
  normalizeMargins,
  normalizePosition,
  normalizeTheme,
  normalizeVerticalPosition,
} from "./normalize.js";

export type {
  Margins,
  NotificationAction,
  Position,
  VerticalPosition,
} from "./normalize.js";

export type Matcher = {
  title: string;
  body: string;
  appName: string;
};

export type Configuration = {
  enabled: boolean;
  rateLimiting: {
    enabled: boolean;
    notificationThreshold: number;
    action: NotificationAction;
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
    verticalPosition: VerticalPosition;
    hideAppTitleRow: boolean;
  };
  colors: {
    enabled: boolean;
    theme: NotificationTheme;
  };
  margins: {
    enabled: boolean;
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
};

export type PatternOverrides = {
  rateLimiting: boolean;
  timeout: boolean;
  urgency: boolean;
  display: boolean;
  colors: boolean;
  margins: boolean;
};

export type PatternConfigurationPrefs = {
  shortName: string;
  matcher: Matcher;
  overrides: PatternOverrides;
  filtering: {
    enabled: boolean;
    action: NotificationAction;
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
  verticalPositionChanged: [VerticalPosition];
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
        action: "close",
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
        verticalPosition: "top",
        hideAppTitleRow: false,
      },
      colors: {
        enabled: true,
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
    };
  }

  static defaultPatternConfiguration(
    matcher: Matcher = { title: "", body: "", appName: "" },
  ): PatternConfiguration {
    return {
      enabled: true,
      shortName: "",
      matcher,
      overrides: {
        rateLimiting: false,
        timeout: false,
        urgency: false,
        display: false,
        colors: false,
        margins: false,
      },
      filtering: { enabled: false, action: "hide" },
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
      urgency: { alwaysNormalUrgency: false },
      display: {
        enableFullscreen: false,
        notificationPosition: "center",
        verticalPosition: "top",
        hideAppTitleRow: false,
      },
      colors: { enabled: false, theme: { ...DEFAULT_THEME } },
      margins: { enabled: false, top: 0, bottom: 0, left: 0, right: 0 },
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

  get verticalPosition() {
    return this._globalConfiguration.display.verticalPosition;
  }

  getPositionFor(source: string, title: string, body: string): Position {
    const pattern = this.findPatternBy(
      source,
      title,
      body,
      (pattern) => pattern.overrides.display,
    );
    return (
      pattern?.display.notificationPosition ??
      this._globalConfiguration.display.notificationPosition
    );
  }

  getVerticalPositionFor(
    source: string,
    title: string,
    body: string,
  ): VerticalPosition {
    const pattern = this.findPatternBy(
      source,
      title,
      body,
      (pattern) => pattern.overrides.display,
    );
    return (
      pattern?.display.verticalPosition ??
      this._globalConfiguration.display.verticalPosition
    );
  }

  shouldHideAppTitleRowFor(
    source: string,
    title: string,
    body: string,
  ): boolean {
    const pattern = this.findPatternBy(
      source,
      title,
      body,
      (pattern) => pattern.overrides.colors || pattern.overrides.margins,
    );
    return (
      pattern?.display.hideAppTitleRow ??
      this._globalConfiguration.display.hideAppTitleRow
    );
  }

  getFilterFor(
    source: string,
    title: string,
    body: string,
  ): NotificationAction | null {
    return (
      this.findPatternBy(
        source,
        title,
        body,
        (pattern) => pattern.filtering.enabled,
      )?.filtering.action ?? null
    );
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

  getThemeFor(source: string, title: string, body: string) {
    const pattern = this.findPatternBy(
      source,
      title,
      body,
      (pattern) => pattern.overrides.colors && pattern.colors.enabled,
    );
    if (pattern) return pattern.colors.theme;
    if (this._globalConfiguration.colors.enabled) {
      return this._globalConfiguration.colors.theme;
    }
    return undefined;
  }

  getMarginsFor(source: string, title: string, body: string): Margins | null {
    const pattern = this.findPatternBy(
      source,
      title,
      body,
      (pattern) => pattern.overrides.margins && pattern.margins.enabled,
    );
    if (pattern) return pattern.margins;
    if (this._globalConfiguration.margins.enabled) {
      return this._globalConfiguration.margins;
    }
    return null;
  }

  getConfigurationFor(
    source: string,
    title: string,
    body: string,
  ): Configuration {
    const matchedPattern = this.findPatternBy(source, title, body);
    if (!matchedPattern) {
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
      display: overrides.display
        ? matchedPattern.display
        : this._globalConfiguration.display,
      colors: overrides.colors
        ? matchedPattern.colors
        : this._globalConfiguration.colors,
      margins: overrides.margins
        ? matchedPattern.margins
        : this._globalConfiguration.margins,
    };
  }

  private load() {
    this._globalConfiguration = SettingsManager.parseGlobalConfiguration(
      this.settings.get_string("global"),
    );
    this._patterns = SettingsManager.parsePatternConfigurations(
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
      this.events.emit("verticalPositionChanged", this.verticalPosition);
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

  static parseGlobalConfiguration(value: string): GlobalConfiguration {
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
          action: normalizeAction(parsed.rateLimiting?.action, "close"),
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
          notificationPosition: normalizePosition(
            parsed.display?.notificationPosition,
          ),
          verticalPosition: normalizeVerticalPosition(
            parsed.display?.verticalPosition,
          ),
          hideAppTitleRow:
            typeof parsed.display?.hideAppTitleRow === "boolean"
              ? parsed.display.hideAppTitleRow
              : false,
        },
        colors: {
          enabled:
            typeof parsed.colors?.enabled === "boolean"
              ? parsed.colors.enabled
              : true,
          theme: normalizeTheme(parsed.colors?.theme),
        },
        margins: {
          enabled:
            typeof parsed.margins?.enabled === "boolean"
              ? parsed.margins.enabled
              : false,
          ...normalizeMargins(parsed.margins),
        },
      };
    } catch {
      return SettingsManager.defaultGlobalConfiguration();
    }
  }

  static parsePatternConfigurations(value: string): PatternConfiguration[] {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const patterns: PatternConfiguration[] = [];
      for (const candidate of parsed) {
        patterns.push(SettingsManager.normalizePattern(candidate));
      }
      return patterns;
    } catch {
      return [];
    }
  }

  static normalizePattern(candidate: unknown): PatternConfiguration {
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
        display:
          typeof object.overrides?.display === "boolean"
            ? object.overrides.display
            : false,
        colors:
          typeof object.overrides?.colors === "boolean"
            ? object.overrides.colors
            : false,
        margins:
          typeof object.overrides?.margins === "boolean"
            ? object.overrides.margins
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
        action: normalizeAction(object.rateLimiting?.action, "close"),
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
        notificationPosition: normalizePosition(
          object.display?.notificationPosition,
        ),
        verticalPosition: normalizeVerticalPosition(
          object.display?.verticalPosition,
        ),
        hideAppTitleRow:
          typeof object.display?.hideAppTitleRow === "boolean"
            ? object.display.hideAppTitleRow
            : false,
      },
      filtering: {
        enabled:
          typeof object.filtering?.enabled === "boolean"
            ? object.filtering.enabled
            : false,
        action: normalizeAction(object.filtering?.action),
      },
      colors: {
        enabled:
          typeof object.colors?.enabled === "boolean"
            ? object.colors.enabled
            : false,
        theme: normalizeTheme(object.colors?.theme),
      },
      margins: {
        enabled:
          typeof object.margins?.enabled === "boolean"
            ? object.margins.enabled
            : false,
        ...normalizeMargins(object.margins),
      },
    };
  }

  private findPatternBy(
    source: string,
    title: string,
    body: string,
    predicate: (pattern: PatternConfiguration) => boolean = () => true,
  ): PatternConfiguration | null {
    for (const pattern of this._patterns) {
      if (!pattern.enabled || !predicate(pattern)) {
        continue;
      }
      if (this.matchesMatcher(pattern.matcher, source, title, body)) {
        return pattern;
      }
    }
    return null;
  }

  private matchesMatcher(
    matcher: Matcher,
    source: string,
    title: string,
    body: string,
  ): boolean {
    const titleMatches =
      !matcher.title.trim() ||
      (Boolean(title.trim()) && this.matchesRegex(title, matcher.title));
    const bodyMatches =
      !matcher.body.trim() ||
      (Boolean(body.trim()) && this.matchesRegex(body, matcher.body));
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
