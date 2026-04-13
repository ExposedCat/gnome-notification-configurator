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
  normalizeBoolean,
  normalizeInteger,
  normalizeMargins,
  normalizeNumber,
  normalizePosition,
  normalizeString,
  normalizeTheme,
  normalizeVerticalPosition,
} from "./normalize.js";

export const NOTIFICATIONS_PER_SOURCE_DEFAULT = 10;

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
  notificationCenter: {
    disableGrouping: boolean;
    maximumPerSource: number;
  };
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
  windowAttention: {
    activateInstead: boolean;
  };
};

export type PatternOverrides = {
  notificationCenter: boolean;
  rateLimiting: boolean;
  timeout: boolean;
  urgency: boolean;
  display: boolean;
  colors: boolean;
  margins: boolean;
  windowAttention: boolean;
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
type MatchableText = string | null;

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
  activateWindowOnAttentionChanged: [boolean];
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
  private _activateWindowOnAttention = false;
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
      notificationCenter: {
        disableGrouping: false,
        maximumPerSource: NOTIFICATIONS_PER_SOURCE_DEFAULT,
      },
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
      windowAttention: {
        activateInstead: false,
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
        notificationCenter: false,
        rateLimiting: false,
        timeout: false,
        urgency: false,
        display: false,
        colors: false,
        margins: false,
        windowAttention: false,
      },
      filtering: { enabled: false, action: "hide" },
      notificationCenter: {
        disableGrouping: false,
        maximumPerSource: NOTIFICATIONS_PER_SOURCE_DEFAULT,
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
      urgency: { alwaysNormalUrgency: false },
      display: {
        enableFullscreen: false,
        notificationPosition: "center",
        verticalPosition: "top",
        hideAppTitleRow: false,
      },
      colors: { enabled: false, theme: { ...DEFAULT_THEME } },
      margins: { enabled: false, top: 0, bottom: 0, left: 0, right: 0 },
      windowAttention: { activateInstead: false },
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

  get activateWindowOnAttention() {
    return this._activateWindowOnAttention;
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
    source: MatchableText,
    title: MatchableText,
    body: MatchableText,
  ): Configuration {
    const matchedPattern = this.findPatternBy(source, title, body);
    if (!matchedPattern) {
      return this._globalConfiguration;
    }
    const overrides = matchedPattern.overrides;
    return {
      ...this._globalConfiguration,
      enabled: matchedPattern.enabled,
      notificationCenter: overrides.notificationCenter
        ? matchedPattern.notificationCenter
        : this._globalConfiguration.notificationCenter,
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
      windowAttention: overrides.windowAttention
        ? matchedPattern.windowAttention
        : this._globalConfiguration.windowAttention,
    };
  }

  shouldActivateWindowOnAttentionFor(
    source: MatchableText,
    title: MatchableText,
    body: MatchableText,
  ): boolean {
    const configuration = this.getConfigurationFor(source, title, body);
    if (!configuration.enabled) {
      return false;
    }
    return configuration.windowAttention.activateInstead;
  }

  shouldDisableNotificationGroupingFor(
    source: MatchableText,
    title: MatchableText,
    body: MatchableText,
  ): boolean {
    const configuration = this.getConfigurationFor(source, title, body);
    if (!configuration.enabled) {
      return false;
    }
    return configuration.notificationCenter.disableGrouping;
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
    this._activateWindowOnAttention =
      this._globalConfiguration.windowAttention.activateInstead;
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
      this.events.emit(
        "activateWindowOnAttentionChanged",
        this._activateWindowOnAttention,
      );
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
      return SettingsManager.normalizeConfiguration(
        parsed,
        SettingsManager.defaultGlobalConfiguration(),
      );
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
      ...SettingsManager.normalizeConfiguration(
        object,
        SettingsManager.defaultPatternConfiguration(),
      ),
      shortName: normalizeString(object.shortName, ""),
      matcher: {
        title: normalizeString(object.matcher?.title, ""),
        body: normalizeString(object.matcher?.body, ""),
        appName: normalizeString(object.matcher?.appName, ""),
      },
      overrides: {
        notificationCenter: normalizeBoolean(
          object.overrides?.notificationCenter,
          false,
        ),
        rateLimiting: normalizeBoolean(object.overrides?.rateLimiting, false),
        timeout: normalizeBoolean(object.overrides?.timeout, false),
        urgency: normalizeBoolean(object.overrides?.urgency, false),
        display: normalizeBoolean(object.overrides?.display, false),
        colors: normalizeBoolean(object.overrides?.colors, false),
        margins: normalizeBoolean(object.overrides?.margins, false),
        windowAttention: normalizeBoolean(
          object.overrides?.windowAttention,
          false,
        ),
      },
      filtering: {
        enabled: normalizeBoolean(object.filtering?.enabled, false),
        action: normalizeAction(object.filtering?.action),
      },
    };
  }

  private static normalizeConfiguration(
    candidate: Partial<Configuration>,
    defaults: Configuration,
  ): Configuration {
    return {
      enabled: normalizeBoolean(candidate.enabled, defaults.enabled),
      notificationCenter: {
        disableGrouping: normalizeBoolean(
          candidate.notificationCenter?.disableGrouping,
          defaults.notificationCenter.disableGrouping,
        ),
        maximumPerSource: normalizeInteger(
          candidate.notificationCenter?.maximumPerSource,
          defaults.notificationCenter.maximumPerSource,
        ),
      },
      rateLimiting: {
        enabled: normalizeBoolean(
          candidate.rateLimiting?.enabled,
          defaults.rateLimiting.enabled,
        ),
        notificationThreshold: normalizeNumber(
          candidate.rateLimiting?.notificationThreshold,
          defaults.rateLimiting.notificationThreshold,
        ),
        action: normalizeAction(
          candidate.rateLimiting?.action,
          defaults.rateLimiting.action,
        ),
      },
      timeout: {
        enabled: normalizeBoolean(
          candidate.timeout?.enabled,
          defaults.timeout.enabled,
        ),
        notificationTimeout: normalizeNumber(
          candidate.timeout?.notificationTimeout,
          defaults.timeout.notificationTimeout,
        ),
        ignoreIdle: normalizeBoolean(
          candidate.timeout?.ignoreIdle,
          defaults.timeout.ignoreIdle,
        ),
      },
      urgency: {
        alwaysNormalUrgency: normalizeBoolean(
          candidate.urgency?.alwaysNormalUrgency,
          defaults.urgency.alwaysNormalUrgency,
        ),
      },
      display: {
        enableFullscreen: normalizeBoolean(
          candidate.display?.enableFullscreen,
          defaults.display.enableFullscreen,
        ),
        notificationPosition: normalizePosition(
          candidate.display?.notificationPosition,
        ),
        verticalPosition: normalizeVerticalPosition(
          candidate.display?.verticalPosition,
        ),
        hideAppTitleRow: normalizeBoolean(
          candidate.display?.hideAppTitleRow,
          defaults.display.hideAppTitleRow,
        ),
      },
      colors: {
        enabled: normalizeBoolean(
          candidate.colors?.enabled,
          defaults.colors.enabled,
        ),
        theme: normalizeTheme(candidate.colors?.theme),
      },
      margins: {
        enabled: normalizeBoolean(
          candidate.margins?.enabled,
          defaults.margins.enabled,
        ),
        ...normalizeMargins(candidate.margins),
      },
      windowAttention: {
        activateInstead: normalizeBoolean(
          candidate.windowAttention?.activateInstead,
          defaults.windowAttention.activateInstead,
        ),
      },
    };
  }

  private findPatternBy(
    source: MatchableText,
    title: MatchableText,
    body: MatchableText,
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
    source: MatchableText,
    title: MatchableText,
    body: MatchableText,
  ): boolean {
    const titleMatches = this.matchesMatcherField(matcher.title, title);
    const bodyMatches = this.matchesMatcherField(matcher.body, body);
    const appNameMatches = this.matchesMatcherField(matcher.appName, source);
    return titleMatches && bodyMatches && appNameMatches;
  }

  private matchesMatcherField(pattern: string, value: MatchableText): boolean {
    const matcher = pattern.trim();
    if (!matcher) {
      return true;
    }
    if (value === null) {
      return true;
    }
    if (!value.trim()) {
      return false;
    }
    return this.matchesRegex(value, matcher);
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
