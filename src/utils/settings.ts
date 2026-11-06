import type Gio from "gi://Gio?version=2.0";

import type { NotificationTheme } from "./constants.js";
import {
  DEFAULT_COUNTS_COLOR,
  DEFAULT_INDICATOR_COLOR,
  DEFAULT_THEME,
} from "./constants.js";
import { TypedEventEmitter } from "./event-emitter.js";
import type {
  IconsOnOpen,
  IndicatorFormat,
  IndicatorOnOpen,
  Margins,
  MonitorSelection,
  NotificationAction,
  Position,
  TopBarDoNotDisturb,
  VerticalPosition,
} from "./normalize.js";
import {
  normalizeAction,
  normalizeBoolean,
  normalizeColor,
  normalizeIconsOnOpen,
  normalizeIndicatorFormat,
  normalizeIndicatorOnOpen,
  normalizeInteger,
  normalizeMargins,
  normalizeMonitor,
  normalizeNumber,
  normalizePosition,
  normalizeSoundFile,
  normalizeString,
  normalizeTheme,
  normalizeTopBarDoNotDisturb,
  normalizeVerticalPosition,
} from "./normalize.js";

export const NOTIFICATIONS_PER_SOURCE_DEFAULT = 10;
export const RECENT_ICONS_DEFAULT = 3;

export type {
  IconsOnOpen,
  IndicatorFormat,
  IndicatorOnOpen,
  Margins,
  MonitorSelection,
  NotificationAction,
  Position,
  TopBarDoNotDisturb,
  VerticalPosition,
} from "./normalize.js";

export type Matcher = {
  title: string;
  body: string;
  appName: string;
};

export type Configuration = {
  enabled: boolean;
  stacking: {
    maximumVisible: number;
    direction: "up" | "down";
  };
  notificationCenter: {
    clearOnFocus: boolean;
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
  sound: {
    enabled: boolean;
    file: string;
  };
  display: {
    monitor: MonitorSelection;
    enableFullscreen: boolean;
    notificationPosition: Position;
    verticalPosition: VerticalPosition;
    hideAppTitleRow: boolean;
  };
  content: {
    hideBody: boolean;
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
  recentIcons: {
    enabled: boolean;
    onOpen: IconsOnOpen;
    maximumCount: number;
    monochrome: boolean;
    counts: boolean;
    countsBackground: boolean;
    countsColor: number[];
  };
  indicator: {
    enabled: boolean;
    onOpen: IndicatorOnOpen;
    format: IndicatorFormat;
    color: number[];
  };
  doNotDisturb: {
    topBar: TopBarDoNotDisturb;
  };
};

export type PatternOverrides = {
  content: boolean;
  stacking: boolean;
  notificationCenter: boolean;
  rateLimiting: boolean;
  timeout: boolean;
  urgency: boolean;
  sound: boolean;
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

export type MediaPlayerConfiguration = {
  enabled: boolean;
  enlarge: boolean;
  background: "empty" | "thumbnail" | "blurred";
  thumbnail: "small" | "big" | "hide";
  source: "show" | "hide";
  sourceRegex: string;
};

export type GlobalConfiguration = Configuration & {
  notificationCenter: Configuration["notificationCenter"] & {
    followBannerAppearance: boolean;
  };
  mediaPlayer: MediaPlayerConfiguration;
};
export type PatternConfiguration = Configuration & PatternConfigurationPrefs;
type MatchableText = string | null;

type SettingsEvents = {
  colorsEnabledChanged: [boolean];
  notificationPositionChanged: [Position];
  verticalPositionChanged: [VerticalPosition];
  monitorChanged: [];
  fullscreenEnabledChanged: [boolean];
  topBarChanged: [];
  clearOnFocusChanged: [];
  stackingChanged: [];
  mediaPlayerChanged: [];
};

export class SettingsManager {
  private settings: Gio.Settings;
  private settingSignals: number[] = [];

  private _colorsEnabled = true;
  private _fullscreenEnabled = false;
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
      mediaPlayer: {
        enabled: true,
        enlarge: false,
        background: "blurred",
        thumbnail: "hide",
        source: "hide",
        sourceRegex: "",
      },
      stacking: { maximumVisible: 1, direction: "down" },
      notificationCenter: {
        followBannerAppearance: true,
        clearOnFocus: false,
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
      sound: { enabled: false, file: "" },
      display: {
        monitor: normalizeMonitor(undefined),
        enableFullscreen: false,
        notificationPosition: "center",
        verticalPosition: "top",
        hideAppTitleRow: false,
      },
      content: { hideBody: false },
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
      recentIcons: {
        enabled: false,
        onOpen: "followIndicator",
        maximumCount: RECENT_ICONS_DEFAULT,
        monochrome: false,
        counts: false,
        countsBackground: true,
        countsColor: [...DEFAULT_COUNTS_COLOR],
      },
      indicator: {
        enabled: true,
        onOpen: "clear",
        format: "dot",
        color: [...DEFAULT_INDICATOR_COLOR],
      },
      doNotDisturb: {
        topBar: "show",
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
        content: false,
        stacking: false,
        notificationCenter: false,
        rateLimiting: false,
        timeout: false,
        urgency: false,
        sound: false,
        display: false,
        colors: false,
        margins: false,
        windowAttention: false,
      },
      filtering: { enabled: false, action: "hide" },
      stacking: { maximumVisible: 1, direction: "down" },
      notificationCenter: {
        clearOnFocus: false,
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
      sound: { enabled: false, file: "" },
      display: {
        monitor: normalizeMonitor(undefined),
        enableFullscreen: false,
        notificationPosition: "center",
        verticalPosition: "top",
        hideAppTitleRow: false,
      },
      content: { hideBody: false },
      colors: { enabled: false, theme: { ...DEFAULT_THEME } },
      margins: { enabled: false, top: 0, bottom: 0, left: 0, right: 0 },
      windowAttention: { activateInstead: false },
      recentIcons: {
        enabled: false,
        onOpen: "followIndicator",
        maximumCount: RECENT_ICONS_DEFAULT,
        monochrome: false,
        counts: false,
        countsBackground: true,
        countsColor: [...DEFAULT_COUNTS_COLOR],
      },
      indicator: {
        enabled: true,
        onOpen: "clear",
        format: "dot",
        color: [...DEFAULT_INDICATOR_COLOR],
      },
      doNotDisturb: {
        topBar: "show",
      },
    };
  }

  dispose() {
    for (const signal of this.settingSignals) {
      this.settings.disconnect(signal);
    }
  }

  get stackingEnabled() {
    return (
      (this._globalConfiguration.enabled &&
        this._globalConfiguration.stacking.maximumVisible > 1) ||
      this._patterns.some(
        (pattern) =>
          pattern.enabled &&
          (pattern.overrides.stacking
            ? pattern.stacking.maximumVisible
            : this._globalConfiguration.stacking.maximumVisible) > 1,
      )
    );
  }

  get colorsEnabled() {
    return this._colorsEnabled;
  }

  get fullscreenEnabled() {
    return this._fullscreenEnabled;
  }

  get clearOnFocusEnabled() {
    return (
      (this._globalConfiguration.enabled &&
        this._globalConfiguration.notificationCenter.clearOnFocus) ||
      this._patterns.some(
        (pattern) =>
          pattern.enabled &&
          (pattern.overrides.notificationCenter
            ? pattern.notificationCenter.clearOnFocus
            : this._globalConfiguration.notificationCenter.clearOnFocus),
      )
    );
  }

  get notificationPosition() {
    return this._globalConfiguration.display.notificationPosition;
  }

  get verticalPosition() {
    return this._globalConfiguration.display.verticalPosition;
  }

  get monitor() {
    return this._globalConfiguration.display.monitor;
  }

  getMonitorFor(source: string, title: string, body: string): MonitorSelection {
    const pattern = this.findPatternBy(
      source,
      title,
      body,
      (pattern) => pattern.overrides.display,
    );
    return pattern?.display.monitor ?? this.monitor;
  }

  get mediaPlayer() {
    return this._globalConfiguration.enabled
      ? this._globalConfiguration.mediaPlayer
      : null;
  }

  get followBannerAppearance() {
    return this._globalConfiguration.notificationCenter.followBannerAppearance;
  }

  get recentIcons() {
    return this._globalConfiguration.recentIcons;
  }

  get indicator() {
    return this._globalConfiguration.indicator;
  }

  get doNotDisturb() {
    return this._globalConfiguration.doNotDisturb;
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
      stacking: overrides.stacking
        ? matchedPattern.stacking
        : this._globalConfiguration.stacking,
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
      sound: overrides.sound
        ? matchedPattern.sound
        : this._globalConfiguration.sound,
      display: overrides.display
        ? matchedPattern.display
        : this._globalConfiguration.display,
      content: overrides.content
        ? matchedPattern.content
        : this._globalConfiguration.content,
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
    this._fullscreenEnabled =
      this._globalConfiguration.display.enableFullscreen;
  }

  private listen() {
    const reload = () => {
      this.load();
      this.events.emit("colorsEnabledChanged", this._colorsEnabled);
      this.events.emit(
        "notificationPositionChanged",
        this.notificationPosition,
      );
      this.events.emit("verticalPositionChanged", this.verticalPosition);
      this.events.emit("monitorChanged");
      this.events.emit("fullscreenEnabledChanged", this._fullscreenEnabled);
      this.events.emit("topBarChanged");
      this.events.emit("clearOnFocusChanged");
      this.events.emit("stackingChanged");
      this.events.emit("mediaPlayerChanged");
    };

    for (const key of ["global", "patterns"]) {
      this.settingSignals.push(
        this.settings.connect(`changed::${key}`, reload),
      );
    }
  }

  static parseGlobalConfiguration(value: string): GlobalConfiguration {
    try {
      const parsed = JSON.parse(value) as Partial<GlobalConfiguration>;
      const defaults = SettingsManager.defaultGlobalConfiguration();
      const configuration = SettingsManager.normalizeConfiguration(
        parsed,
        defaults,
      );
      const mediaPlayer = parsed.mediaPlayer;
      return {
        ...configuration,
        notificationCenter: {
          ...configuration.notificationCenter,
          followBannerAppearance: normalizeBoolean(
            parsed.notificationCenter?.followBannerAppearance,
            defaults.notificationCenter.followBannerAppearance,
          ),
        },
        mediaPlayer: {
          enabled: normalizeBoolean(mediaPlayer?.enabled, true),
          enlarge: normalizeBoolean(mediaPlayer?.enlarge, false),
          background:
            mediaPlayer?.background === "empty" ||
            mediaPlayer?.background === "thumbnail"
              ? mediaPlayer.background
              : "blurred",
          thumbnail:
            mediaPlayer?.thumbnail === "small" ||
            mediaPlayer?.thumbnail === "big"
              ? mediaPlayer.thumbnail
              : "hide",
          source: mediaPlayer?.source === "show" ? "show" : "hide",
          sourceRegex: normalizeString(mediaPlayer?.sourceRegex, ""),
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
        content: normalizeBoolean(object.overrides?.content, false),
        stacking: normalizeBoolean(object.overrides?.stacking, false),
        notificationCenter: normalizeBoolean(
          object.overrides?.notificationCenter,
          false,
        ),
        rateLimiting: normalizeBoolean(object.overrides?.rateLimiting, false),
        timeout: normalizeBoolean(object.overrides?.timeout, false),
        urgency: normalizeBoolean(object.overrides?.urgency, false),
        sound: normalizeBoolean(object.overrides?.sound, false),
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
    const stacking = candidate.stacking;
    const stackingDisabled =
      stacking && "enabled" in stacking && stacking.enabled === false;
    return {
      enabled: normalizeBoolean(candidate.enabled, defaults.enabled),
      stacking: {
        maximumVisible: stackingDisabled
          ? 1
          : Math.max(
              1,
              Math.min(
                10,
                normalizeInteger(
                  candidate.stacking?.maximumVisible,
                  defaults.stacking.maximumVisible,
                ),
              ),
            ),
        direction: candidate.stacking?.direction === "up" ? "up" : "down",
      },
      notificationCenter: {
        clearOnFocus: normalizeBoolean(
          candidate.notificationCenter?.clearOnFocus,
          defaults.notificationCenter.clearOnFocus,
        ),
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
      sound: {
        enabled: normalizeBoolean(
          candidate.sound?.enabled,
          defaults.sound.enabled,
        ),
        file: normalizeSoundFile(candidate.sound?.file),
      },
      display: {
        monitor: normalizeMonitor(candidate.display?.monitor),
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
      content: {
        hideBody: normalizeBoolean(
          candidate.content?.hideBody,
          defaults.content.hideBody,
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
      recentIcons: {
        enabled: normalizeBoolean(
          candidate.recentIcons?.enabled,
          defaults.recentIcons.enabled,
        ),
        onOpen: normalizeIconsOnOpen(candidate.recentIcons?.onOpen),
        maximumCount: normalizeInteger(
          candidate.recentIcons?.maximumCount,
          defaults.recentIcons.maximumCount,
        ),
        monochrome: normalizeBoolean(
          candidate.recentIcons?.monochrome,
          defaults.recentIcons.monochrome,
        ),
        counts: normalizeBoolean(
          candidate.recentIcons?.counts,
          defaults.recentIcons.counts,
        ),
        countsBackground: normalizeBoolean(
          candidate.recentIcons?.countsBackground,
          defaults.recentIcons.countsBackground,
        ),
        countsColor: normalizeColor(
          candidate.recentIcons?.countsColor,
          defaults.recentIcons.countsColor,
        ),
      },
      indicator: {
        enabled: normalizeBoolean(
          candidate.indicator?.enabled,
          defaults.indicator.enabled,
        ),
        onOpen: normalizeIndicatorOnOpen(candidate.indicator?.onOpen),
        format: normalizeIndicatorFormat(candidate.indicator?.format),
        color: normalizeColor(
          candidate.indicator?.color,
          defaults.indicator.color,
        ),
      },
      doNotDisturb: {
        topBar: normalizeTopBarDoNotDisturb(candidate.doNotDisturb?.topBar),
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
    try {
      return new RegExp(matcher, "i").test(value);
    } catch {
      return false;
    }
  }
}
