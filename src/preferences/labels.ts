import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type {
  GlobalConfiguration,
  PatternConfiguration,
} from "../utils/settings.js";

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
      "overrides.stacking": _("Override Visible Notifications"),
      "stacking.maximumVisible": _("Maximum Visible Notifications"),
      "stacking.direction": _("Stack Direction"),
      "overrides.timeout": _("Override Notification Timeout"),
      "overrides.urgency": _("Override Urgency"),
      "overrides.sound": _("Override Notification Sound"),
      "overrides.display": _("Override Display"),
      "overrides.colors": _("Override Custom Styles"),
      "overrides.margins": _("Override Custom Margins"),
      "overrides.windowAttention": _("Override Window Attention"),
      "filtering.enabled": _("Enable Filtering"),
      "filtering.action": _("Filter Action"),
      "notificationCenter.followBannerAppearance": _(
        "Follow banner appearance",
      ),
      "notificationCenter.clearOnFocus": _("Clear Notifications on Focus"),
      "notificationCenter.disableGrouping": _("Disable Stacking"),
      "notificationCenter.maximumPerSource": _("Maximum Per Source"),
      "rateLimiting.enabled": _("Enable Rate Limiting"),
      "rateLimiting.notificationThreshold": _("Notification Threshold"),
      "rateLimiting.action": _("Rate Limiting Action"),
      "timeout.enabled": _("Enable Timeout Override"),
      "timeout.notificationTimeout": _("Timeout Duration"),
      "timeout.ignoreIdle": _("Ignore Idle State"),
      "urgency.alwaysNormalUrgency": _("Force Normal Urgency"),
      "sound.enabled": _("Play a Notification Sound"),
      "sound.file": _("Notification Sound File"),
      "display.enableFullscreen": _("Enable Notifications in Fullscreen"),
      "display.monitor.connector": _("Monitor Connector"),
      "display.monitor.vendor": _("Monitor Vendor"),
      "display.monitor.product": _("Monitor Model"),
      "display.monitor.serial": _("Monitor Serial"),
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
      "recentIcons.enabled": _("Show App Icons"),
      "recentIcons.onOpen": _("Icons on Notification Center Opening"),
      "recentIcons.maximumCount": _("Maximum Icons"),
      "recentIcons.monochrome": _("Monochrome Icons"),
      "recentIcons.counts": _("Notification Counts"),
      "recentIcons.countsBackground": _("Counts Background"),
      "recentIcons.countsColor": _("Counts Color"),
      "indicator.enabled": _("Show Indicator"),
      "indicator.onOpen": _("Indicator on Notification Center Opening"),
      "indicator.format": _("Indicator Format"),
      "indicator.color": _("Indicator Color"),
      "mediaPlayer.enabled": _("Media Player Enabled"),
      "mediaPlayer.enlarge": _("Enlarge Media Player"),
      "mediaPlayer.background": _("Media Player Background"),
      "mediaPlayer.thumbnail": _("Media Player Thumbnail"),
      "mediaPlayer.source": _("Media Player Source"),
      "mediaPlayer.sourceRegex": _("Media Player Source Pattern"),
      "doNotDisturb.topBar": _("Top Bar in Do Not Disturb"),
    } satisfies Record<
      FieldPath<PatternConfiguration & GlobalConfiguration>,
      string
    >),
  );
}
