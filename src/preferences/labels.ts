import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type { PatternConfiguration } from "../utils/settings.js";

type FieldPath<Configuration> = {
  [Key in keyof Configuration & string]: Configuration[Key] extends
    | string
    | number
    | boolean
    | readonly number[]
    ? Key
    : `${Key}.${FieldPath<Configuration[Key]>}`;
}[keyof Configuration & string];

export function configurationLabels(): Map<string, string> {
  return new Map(
    Object.entries({
      enabled: _("Enabled"),
      shortName: _("Short Name"),
      "matcher.appName": _("App Name"),
      "matcher.title": _("Title"),
      "matcher.body": _("Body"),
      "overrides.notificationCenter": _("Override Notification Center"),
      "overrides.rateLimiting": _("Override Rate Limiting"),
      "overrides.timeout": _("Override Notification Timeout"),
      "overrides.urgency": _("Override Urgency"),
      "overrides.display": _("Override Display"),
      "overrides.colors": _("Override Custom Styles"),
      "overrides.margins": _("Override Custom Margins"),
      "overrides.windowAttention": _("Override Window Attention"),
      "filtering.enabled": _("Enable Filtering"),
      "filtering.action": _("Filter Action"),
      "notificationCenter.disableGrouping": _("Disable Stacking"),
      "notificationCenter.maximumPerSource": _("Maximum Per Source"),
      "rateLimiting.enabled": _("Enable Rate Limiting"),
      "rateLimiting.notificationThreshold": _("Notification Threshold"),
      "rateLimiting.action": _("Rate Limiting Action"),
      "timeout.enabled": _("Enable Timeout Override"),
      "timeout.notificationTimeout": _("Timeout Duration"),
      "timeout.ignoreIdle": _("Ignore Idle State"),
      "urgency.alwaysNormalUrgency": _("Force Normal Urgency"),
      "display.enableFullscreen": _("Enable Notifications in Fullscreen"),
      "display.notificationPosition": _("Horizontal Alignment"),
      "display.verticalPosition": _("Vertical Alignment"),
      "display.hideAppTitleRow": _("Hide App Title Row"),
      "colors.enabled": _("Enable Custom Styles"),
      "colors.theme.appNameColor": _("App Name Color"),
      "colors.theme.timeColor": _("Time Color"),
      "colors.theme.backgroundColor": _("Background Color"),
      "colors.theme.titleColor": _("Title Color"),
      "colors.theme.bodyColor": _("Body Text Color"),
      "colors.theme.appNameFontSize": _("App Name Font Size"),
      "colors.theme.timeFontSize": _("Time Font Size"),
      "colors.theme.titleFontSize": _("Title Font Size"),
      "colors.theme.bodyFontSize": _("Body Text Font Size"),
      "margins.enabled": _("Enable Custom Margins"),
      "margins.top": _("Margin Top"),
      "margins.bottom": _("Margin Bottom"),
      "margins.left": _("Margin Left"),
      "margins.right": _("Margin Right"),
      "windowAttention.activateInstead": _(
        "Activate Window Instead of Notifying",
      ),
    } satisfies Record<FieldPath<PatternConfiguration>, string>),
  );
}
