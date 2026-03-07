import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { migrateRegexSchema } from "./migrations/regex.js";
import type { NotificationTheme } from "./utils/constants.js";
import { DEFAULT_THEME } from "./utils/constants.js";
import type {
  Configuration,
  GlobalConfiguration,
  PatternConfiguration,
  PatternOverrides,
  Position,
} from "./utils/settings.js";
import { SettingsManager } from "./utils/settings.js";

type ColorKey =
  | "appNameColor"
  | "timeColor"
  | "backgroundColor"
  | "titleColor"
  | "bodyColor";

type FontSizeKey =
  | "appNameFontSize"
  | "timeFontSize"
  | "titleFontSize"
  | "bodyFontSize";

type ThemeField = {
  label: string;
  colorKey: ColorKey;
  fontKey: FontSizeKey | null;
};

const POSITION_VALUES: Position[] = ["fill", "left", "center", "right"];

const THEME_FIELDS: ThemeField[] = [
  { label: "Background", colorKey: "backgroundColor", fontKey: null },
  { label: "Title", colorKey: "titleColor", fontKey: "titleFontSize" },
  { label: "Body Text", colorKey: "bodyColor", fontKey: "bodyFontSize" },
  {
    label: "App Name",
    colorKey: "appNameColor",
    fontKey: "appNameFontSize",
  },
  { label: "Time", colorKey: "timeColor", fontKey: "timeFontSize" },
];

export default class NotificationConfiguratorPreferences extends ExtensionPreferences {
  private settings!: Gio.Settings;
  private globalConfig!: GlobalConfiguration;
  private patterns!: PatternConfiguration[];
  private patternsList!: Gtk.ListBox;

  fillPreferencesWindow(window: Adw.PreferencesWindow) {
    this.settings = this.getSettings();
    migrateRegexSchema(this.settings);
    this.loadData();

    const globalPage = new Adw.PreferencesPage({
      title: _("Global"),
      icon_name: "preferences-system-symbolic",
    });
    window.add(globalPage);
    this.buildGlobalPage(globalPage);

    const patternsPage = new Adw.PreferencesPage({
      title: _("Patterns"),
      icon_name: "view-list-symbolic",
    });
    window.add(patternsPage);
    this.buildPatternsPage(window, patternsPage);

    window.connect("close-request", () => {
      // biome-ignore lint/style/noNonNullAssertion: cleanup
      this.settings = null!;
      // biome-ignore lint/style/noNonNullAssertion: cleanup
      this.globalConfig = null!;
      this.patterns = [];
      // biome-ignore lint/style/noNonNullAssertion: cleanup
      this.patternsList = null!;
    });
  }

  private loadData() {
    try {
      const parsed = JSON.parse(this.settings.get_string("global") ?? "{}");
      this.globalConfig =
        parsed && typeof parsed === "object" && parsed.enabled !== undefined
          ? parsed
          : SettingsManager.defaultGlobalConfiguration();
    } catch {
      this.globalConfig = SettingsManager.defaultGlobalConfiguration();
    }

    try {
      const parsed = JSON.parse(this.settings.get_string("patterns") ?? "[]");
      this.patterns = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.patterns = [];
    }
  }

  private saveGlobal() {
    this.settings.set_string("global", JSON.stringify(this.globalConfig));
  }

  private savePatterns() {
    this.settings.set_string("patterns", JSON.stringify(this.patterns));
  }

  private buildGlobalPage(page: Adw.PreferencesPage) {
    const enabledGroup = new Adw.PreferencesGroup();
    page.add(enabledGroup);

    const enabledRow = new Adw.SwitchRow({
      title: _("Enabled"),
      subtitle: _("Master switch for all notification configuration"),
    });
    enabledRow.set_active(this.globalConfig.enabled);
    enabledRow.connect("notify::active", () => {
      this.globalConfig.enabled = enabledRow.get_active();
      this.saveGlobal();
    });
    enabledGroup.add(enabledRow);

    this.addConfigurationGroups(
      page,
      this.globalConfig,
      () => this.saveGlobal(),
      null,
    );

    this.addTestSection(page);
  }

  private buildPatternsPage(
    window: Adw.PreferencesWindow,
    page: Adw.PreferencesPage,
  ) {
    const patternsGroup = new Adw.PreferencesGroup({
      title: _("Notification Patterns"),
      description: _(
        "Per-pattern overrides that apply to matching notifications",
      ),
    });
    page.add(patternsGroup);

    this.patternsList = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      css_classes: ["boxed-list"],
    });
    patternsGroup.add(this.patternsList);
    this.rebuildPatternsList(window);

    const addGroup = new Adw.PreferencesGroup();
    page.add(addGroup);

    const addButton = new Gtk.Button({
      label: _("New Pattern"),
      css_classes: ["suggested-action"],
      margin_top: 6,
    });
    addButton.connect("clicked", () => {
      const newPattern = SettingsManager.defaultPatternConfiguration();
      this.patterns.push(newPattern);
      this.savePatterns();
      this.rebuildPatternsList(window);
      this.openPatternDetail(window, this.patterns.length - 1);
    });
    addGroup.add(addButton);
  }

  private rebuildPatternsList(window: Adw.PreferencesWindow) {
    let child = this.patternsList.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      this.patternsList.remove(child);
      child = next;
    }

    for (const [index, pattern] of this.patterns.entries()) {
      const row = new Adw.ActionRow({
        title: pattern.shortName || _("Unnamed Pattern"),
        subtitle: this.buildPatternSubtitle(pattern),
        activatable: true,
      });
      row.add_suffix(new Gtk.Image({ icon_name: "go-next-symbolic" }));
      row.connect("activated", () => {
        this.openPatternDetail(window, index);
      });
      this.patternsList.append(row);
    }
  }

  private buildPatternSubtitle(pattern: PatternConfiguration): string {
    const parts: string[] = [];
    if (pattern.matcher.appName.trim()) {
      parts.push(`App: ${pattern.matcher.appName}`);
    }
    if (pattern.matcher.title.trim()) {
      parts.push(`Title: ${pattern.matcher.title}`);
    }
    if (pattern.matcher.body.trim()) {
      parts.push(`Body: ${pattern.matcher.body}`);
    }
    return parts.length > 0 ? parts.join(" · ") : _("No matchers configured");
  }

  private openPatternDetail(window: Adw.PreferencesWindow, index: number) {
    const pattern = this.patterns[index];
    const detailPage = new Adw.PreferencesPage();

    const identityGroup = new Adw.PreferencesGroup({
      title: _("Pattern Identity"),
    });
    detailPage.add(identityGroup);

    const shortNameRow = new Adw.EntryRow({
      title: _("Short Name"),
    });
    shortNameRow.set_text(pattern.shortName);
    shortNameRow.connect("changed", () => {
      pattern.shortName = shortNameRow.get_text();
      this.savePatterns();
    });
    identityGroup.add(shortNameRow);

    const enabledRow = new Adw.SwitchRow({
      title: _("Enabled"),
      subtitle: _("Enable this pattern override"),
    });
    enabledRow.set_active(pattern.enabled);
    enabledRow.connect("notify::active", () => {
      pattern.enabled = enabledRow.get_active();
      this.savePatterns();
    });
    identityGroup.add(enabledRow);

    const matcherGroup = new Adw.PreferencesGroup({
      title: _("Matchers"),
      description: _("RegExp patterns to match notifications"),
    });
    detailPage.add(matcherGroup);

    const appNameRow = this.createRegexEntryRow(
      _("App Name"),
      pattern.matcher.appName,
      (value) => {
        pattern.matcher.appName = value;
        this.savePatterns();
      },
    );
    matcherGroup.add(appNameRow);

    const titleRow = this.createRegexEntryRow(
      _("Title"),
      pattern.matcher.title,
      (value) => {
        pattern.matcher.title = value;
        this.savePatterns();
      },
    );
    matcherGroup.add(titleRow);

    const bodyRow = this.createRegexEntryRow(
      _("Body"),
      pattern.matcher.body,
      (value) => {
        pattern.matcher.body = value;
        this.savePatterns();
      },
    );
    matcherGroup.add(bodyRow);

    const filterGroup = new Adw.PreferencesGroup({
      title: _("Filtering"),
      description: _("Block or hide matching notifications"),
    });
    detailPage.add(filterGroup);

    const filterActionRow = new Adw.ComboRow({
      title: _("Filter Action"),
      subtitle: _("What to do with matching notifications"),
    });
    const actionModel = new Gtk.StringList();
    actionModel.append(_("Hide notification"));
    actionModel.append(_("Close notification"));
    filterActionRow.set_model(actionModel);
    filterActionRow.set_selected(pattern.filtering.action === "close" ? 1 : 0);
    filterActionRow.set_visible(pattern.filtering.enabled);
    filterActionRow.connect("notify::selected", () => {
      pattern.filtering.action =
        filterActionRow.get_selected() === 1 ? "close" : "hide";
      this.savePatterns();
    });

    const filterEnabledRow = new Adw.SwitchRow({
      title: _("Enable Filtering"),
      subtitle: _("Apply filter action to matching notifications"),
    });
    filterEnabledRow.set_active(pattern.filtering.enabled);
    filterEnabledRow.connect("notify::active", () => {
      pattern.filtering.enabled = filterEnabledRow.get_active();
      this.savePatterns();
      filterActionRow.set_visible(pattern.filtering.enabled);
    });
    filterGroup.add(filterEnabledRow);
    filterGroup.add(filterActionRow);

    this.addConfigurationGroups(
      detailPage,
      pattern,
      () => this.savePatterns(),
      pattern.overrides,
    );

    this.addTestSection(detailPage);

    const deleteGroup = new Adw.PreferencesGroup();
    detailPage.add(deleteGroup);

    const deleteButton = new Gtk.Button({
      label: _("Delete Pattern"),
      css_classes: ["destructive-action"],
      margin_top: 12,
    });
    deleteButton.connect("clicked", () => {
      this.patterns.splice(index, 1);
      this.savePatterns();
      this.rebuildPatternsList(window);
      window.pop_subpage();
    });
    deleteGroup.add(deleteButton);

    const toolbarView = new Adw.ToolbarView();
    toolbarView.add_top_bar(new Adw.HeaderBar());
    toolbarView.set_content(detailPage);

    const navigationPage = new Adw.NavigationPage({
      title: pattern.shortName || _("Pattern"),
      child: toolbarView,
    });
    navigationPage.connect("hidden", () => {
      this.rebuildPatternsList(window);
    });

    window.push_subpage(navigationPage);
  }

  private addConfigurationGroups(
    page: Adw.PreferencesPage,
    config: Configuration,
    onSave: () => void,
    overrides: PatternOverrides | null,
  ) {
    const rateLimitGroup = new Adw.PreferencesGroup({
      title: _("Rate Limiting"),
      description: _("Control notification frequency per application"),
    });
    page.add(rateLimitGroup);

    const thresholdRow = new Adw.SpinRow({
      title: _("Notification Threshold"),
      subtitle: _(
        "Time in milliseconds before allowing duplicate notifications",
      ),
      adjustment: new Gtk.Adjustment({
        lower: 100,
        upper: 60000,
        step_increment: 100,
        page_increment: 1000,
        value: config.rateLimiting.notificationThreshold,
      }),
    });
    thresholdRow.connect("notify::value", () => {
      config.rateLimiting.notificationThreshold = thresholdRow.get_value();
      onSave();
    });

    const rateLimitActionRow = new Adw.ComboRow({
      title: _("Action"),
      subtitle: _("What to do with rate-limited notifications"),
    });
    const rateLimitActionModel = new Gtk.StringList();
    rateLimitActionModel.append(_("Close notification"));
    rateLimitActionModel.append(_("Hide notification"));
    rateLimitActionRow.set_model(rateLimitActionModel);
    rateLimitActionRow.set_selected(
      config.rateLimiting.action === "hide" ? 1 : 0,
    );
    rateLimitActionRow.connect("notify::selected", () => {
      config.rateLimiting.action =
        rateLimitActionRow.get_selected() === 1 ? "hide" : "close";
      onSave();
    });

    const rateLimitEnabledRow = new Adw.SwitchRow({
      title: _("Enable Rate Limiting"),
      subtitle: _("Prevent duplicate notifications within threshold time"),
    });
    rateLimitEnabledRow.set_active(config.rateLimiting.enabled);

    const updateRateLimitVisibility = () => {
      const active = !overrides || overrides.rateLimiting;
      rateLimitEnabledRow.set_visible(active);
      thresholdRow.set_visible(active && config.rateLimiting.enabled);
      rateLimitActionRow.set_visible(active && config.rateLimiting.enabled);
    };

    rateLimitEnabledRow.connect("notify::active", () => {
      config.rateLimiting.enabled = rateLimitEnabledRow.get_active();
      onSave();
      updateRateLimitVisibility();
    });

    if (overrides) {
      this.addOverrideRow(
        rateLimitGroup,
        overrides,
        "rateLimiting",
        onSave,
        updateRateLimitVisibility,
      );
    }

    rateLimitGroup.add(rateLimitEnabledRow);
    rateLimitGroup.add(thresholdRow);
    rateLimitGroup.add(rateLimitActionRow);
    updateRateLimitVisibility();

    const timeoutGroup = new Adw.PreferencesGroup({
      title: _("Notification Timeout"),
      description: _("Control how long notifications stay visible"),
    });
    page.add(timeoutGroup);

    const timeoutRow = new Adw.SpinRow({
      title: _("Timeout Duration"),
      subtitle: _(
        "Time in milliseconds before auto-dismiss (0 = never dismiss)",
      ),
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 30000,
        step_increment: 500,
        page_increment: 1000,
        value: config.timeout.notificationTimeout,
      }),
    });
    timeoutRow.connect("notify::value", () => {
      config.timeout.notificationTimeout = timeoutRow.get_value();
      onSave();
    });

    const ignoreIdleRow = new Adw.SwitchRow({
      title: _("Ignore Idle State"),
      subtitle: _("Keep showing notifications even when user is idle"),
    });
    ignoreIdleRow.set_active(config.timeout.ignoreIdle);
    ignoreIdleRow.connect("notify::active", () => {
      config.timeout.ignoreIdle = ignoreIdleRow.get_active();
      onSave();
    });

    const timeoutEnabledRow = new Adw.SwitchRow({
      title: _("Enable Timeout Override"),
      subtitle: _("Override default notification timeout"),
    });
    timeoutEnabledRow.set_active(config.timeout.enabled);

    const updateTimeoutVisibility = () => {
      const active = !overrides || overrides.timeout;
      timeoutEnabledRow.set_visible(active);
      timeoutRow.set_visible(active && config.timeout.enabled);
      ignoreIdleRow.set_visible(active && config.timeout.enabled);
    };

    timeoutEnabledRow.connect("notify::active", () => {
      config.timeout.enabled = timeoutEnabledRow.get_active();
      onSave();
      updateTimeoutVisibility();
    });

    if (overrides) {
      this.addOverrideRow(
        timeoutGroup,
        overrides,
        "timeout",
        onSave,
        updateTimeoutVisibility,
      );
    }

    timeoutGroup.add(timeoutEnabledRow);
    timeoutGroup.add(timeoutRow);
    timeoutGroup.add(ignoreIdleRow);
    updateTimeoutVisibility();

    const urgencyGroup = new Adw.PreferencesGroup({
      title: _("Urgency"),
    });
    page.add(urgencyGroup);

    const forceNormalRow = new Adw.SwitchRow({
      title: _("Force Normal Urgency"),
      subtitle: _("Make all notifications use normal urgency level"),
    });
    forceNormalRow.set_active(config.urgency.alwaysNormalUrgency);
    forceNormalRow.connect("notify::active", () => {
      config.urgency.alwaysNormalUrgency = forceNormalRow.get_active();
      onSave();
    });

    const updateUrgencyVisibility = () => {
      forceNormalRow.set_visible(!overrides || overrides.urgency);
    };

    if (overrides) {
      this.addOverrideRow(
        urgencyGroup,
        overrides,
        "urgency",
        onSave,
        updateUrgencyVisibility,
      );
    }

    urgencyGroup.add(forceNormalRow);
    updateUrgencyVisibility();

    const displayGroup = new Adw.PreferencesGroup({
      title: _("Display"),
    });
    page.add(displayGroup);

    if (!overrides) {
      const fullscreenRow = new Adw.SwitchRow({
        title: _("Enable Notifications in Fullscreen"),
        subtitle: _(
          "Show notifications even when applications are in fullscreen",
        ),
      });
      fullscreenRow.set_active(config.display.enableFullscreen);
      fullscreenRow.connect("notify::active", () => {
        config.display.enableFullscreen = fullscreenRow.get_active();
        onSave();
      });
      displayGroup.add(fullscreenRow);
    }

    const positionRow = new Adw.ComboRow({
      title: _("Notification Position"),
      subtitle: _("Choose where notifications appear on screen"),
    });
    const positionModel = new Gtk.StringList();
    positionModel.append(_("Fill Screen"));
    positionModel.append(_("Left"));
    positionModel.append(_("Center"));
    positionModel.append(_("Right"));
    positionRow.set_model(positionModel);
    const positionIndex = POSITION_VALUES.indexOf(
      config.display.notificationPosition,
    );
    positionRow.set_selected(positionIndex >= 0 ? positionIndex : 2);
    positionRow.connect("notify::selected", () => {
      config.display.notificationPosition =
        POSITION_VALUES[positionRow.get_selected()] ?? "center";
      onSave();
    });

    const updateDisplayVisibility = () => {
      positionRow.set_visible(!overrides || overrides.display);
    };

    if (overrides) {
      this.addOverrideRow(
        displayGroup,
        overrides,
        "display",
        onSave,
        updateDisplayVisibility,
      );
    }

    displayGroup.add(positionRow);
    updateDisplayVisibility();

    const colorsGroup = new Adw.PreferencesGroup({
      title: _("Appearance"),
      description: _("Customize notification colors and font sizes"),
    });
    page.add(colorsGroup);

    const colorsEnabledRow = new Adw.SwitchRow({
      title: _("Enable Custom Colors"),
      subtitle: _("Apply custom colors to notifications"),
    });
    colorsEnabledRow.set_active(config.colors.enabled);

    const themeRows = this.addThemeEditor(
      colorsGroup,
      config.colors.theme,
      onSave,
    );

    const updateColorsVisibility = () => {
      const active = !overrides || overrides.colors;
      colorsEnabledRow.set_visible(active);
      for (const row of themeRows) {
        row.set_visible(active && config.colors.enabled);
      }
    };

    colorsEnabledRow.connect("notify::active", () => {
      config.colors.enabled = colorsEnabledRow.get_active();
      onSave();
      updateColorsVisibility();
    });

    if (overrides) {
      this.addOverrideRow(
        colorsGroup,
        overrides,
        "colors",
        onSave,
        updateColorsVisibility,
      );
    }

    colorsGroup.add(colorsEnabledRow);
    for (const row of themeRows) {
      colorsGroup.add(row);
    }
    updateColorsVisibility();
  }

  private addOverrideRow(
    group: Adw.PreferencesGroup,
    overrides: PatternOverrides,
    key: keyof PatternOverrides,
    onSave: () => void,
    updateVisibility: () => void,
  ) {
    const row = new Adw.SwitchRow({
      title: _("Override"),
      subtitle: _("Override global setting for this pattern"),
    });
    row.set_active(overrides[key]);
    row.connect("notify::active", () => {
      overrides[key] = row.get_active();
      onSave();
      updateVisibility();
    });
    group.add(row);
  }

  private addThemeEditor(
    _group: Adw.PreferencesGroup,
    theme: NotificationTheme,
    onSave: () => void,
  ): Adw.ActionRow[] {
    const rows: Adw.ActionRow[] = [];

    for (const field of THEME_FIELDS) {
      const row = new Adw.ActionRow({
        title: _(field.label),
      });

      const colorValue = theme[field.colorKey];
      const colorButton = new Gtk.ColorButton({
        use_alpha: false,
        valign: Gtk.Align.CENTER,
      });
      colorButton.set_rgba(
        new Gdk.RGBA({
          red: colorValue[0] ?? 0,
          green: colorValue[1] ?? 0,
          blue: colorValue[2] ?? 0,
          alpha: colorValue[3] ?? 1,
        }),
      );
      colorButton.connect("color-set", () => {
        const rgba = colorButton.get_rgba();
        theme[field.colorKey] = [rgba.red, rgba.green, rgba.blue, rgba.alpha];
        onSave();
      });
      row.add_suffix(colorButton);

      if (field.fontKey) {
        const fontKey = field.fontKey;
        const fontSizeValue = theme[fontKey] ?? DEFAULT_THEME[fontKey];

        const fontSizeButton = new Gtk.SpinButton({
          adjustment: new Gtk.Adjustment({
            lower: 0,
            upper: 32,
            step_increment: 1,
            page_increment: 2,
          }),
          value: fontSizeValue,
          valign: Gtk.Align.CENTER,
        });
        fontSizeButton.connect("value-changed", () => {
          theme[fontKey] = fontSizeButton.get_value();
          onSave();
        });
        row.add_suffix(fontSizeButton);

        row.add_suffix(
          new Gtk.Label({
            label: _("px"),
            css_classes: ["caption"],
            valign: Gtk.Align.CENTER,
          }),
        );
      }

      rows.push(row);
    }

    return rows;
  }

  private createRegexEntryRow(
    title: string,
    initialValue: string,
    onChanged: (value: string) => void,
  ): Adw.EntryRow {
    const row = new Adw.EntryRow({ title });
    row.set_text(initialValue);
    row.connect("changed", () => {
      const text = row.get_text();
      onChanged(text);
      this.validateRegexRow(row, text);
    });
    this.validateRegexRow(row, initialValue);
    return row;
  }

  private validateRegexRow(row: Adw.EntryRow, pattern: string) {
    if (!pattern.trim()) {
      row.remove_css_class("error");
      return;
    }
    try {
      new RegExp(pattern, "i");
      row.remove_css_class("error");
    } catch {
      row.add_css_class("error");
    }
  }

  private addTestSection(page: Adw.PreferencesPage) {
    const testGroup = new Adw.PreferencesGroup({
      title: _("Test Notifications"),
    });
    page.add(testGroup);

    const appEntry = new Adw.EntryRow({
      title: _("App Name"),
    });
    appEntry.set_text(_("Test Application Name"));
    testGroup.add(appEntry);

    const titleEntry = new Adw.EntryRow({
      title: _("Title"),
    });
    titleEntry.set_text(_("Test Notification Title"));
    testGroup.add(titleEntry);

    const bodyEntry = new Adw.EntryRow({
      title: _("Body"),
    });
    bodyEntry.set_text(_("Test Notification Body"));
    testGroup.add(bodyEntry);

    const testButtonGroup = new Adw.PreferencesGroup();
    page.add(testButtonGroup);

    const testButton = new Gtk.Button({
      label: _("Send Test Notification"),
      css_classes: ["suggested-action"],
      margin_top: 6,
    });
    testButton.connect("clicked", () => {
      const appName = appEntry.get_text() || _("Test App");
      const title = titleEntry.get_text() || _("Test Notification");
      const body = bodyEntry.get_text() || _("This is a test notification");
      this.sendNotification(appName, title, body);
    });
    testButtonGroup.add(testButton);
  }

  private sendNotification(appName: string, title: string, body: string) {
    try {
      const proc = Gio.Subprocess.new(
        [
          "notify-send",
          `--app-name=${appName}`,
          "--icon=dialog-information",
          title,
          body,
        ],
        Gio.SubprocessFlags.NONE,
      );
      proc.wait_async(null, null);
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  }
}
