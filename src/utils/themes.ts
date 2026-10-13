import {
  type NotificationWidgets,
  getMessageTrayContainer,
  resolveNotificationWidgets,
} from "../shell/notification-widgets.js";
import type { NotificationTheme } from "./constants.js";
import { DEFAULT_THEME } from "./constants.js";
import type { SettingsManager } from "./settings.js";

type Color = number[];

export function makeColorStyle(
  [red, green, blue, alpha]: Color,
  kind: "color" | "background" = "color",
): string {
  const redComponent = Math.round(red * 255);
  const greenComponent = Math.round(green * 255);
  const blueComponent = Math.round(blue * 255);
  const hex = `#${redComponent.toString(16).padStart(2, "0")}${greenComponent.toString(16).padStart(2, "0")}${blueComponent.toString(16).padStart(2, "0")}`;
  const value =
    alpha < 1
      ? `${hex}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")}`
      : hex;
  return `${kind}: ${value};`;
}

export class ThemesManager {
  private themeSignalId?: number;

  constructor(private settingsManager: SettingsManager) {
    settingsManager.events.on("colorsEnabledChanged", (enabled) => {
      if (enabled) {
        this.enableThemes();
      } else {
        this.disableThemes();
      }
    });
    if (settingsManager.colorsEnabled) {
      this.enableThemes();
    }
  }

  dispose() {
    this.disableThemes();
  }

  private disableThemes() {
    if (typeof this.themeSignalId === "number") {
      getMessageTrayContainer()?.disconnect(this.themeSignalId);
      this.themeSignalId = undefined;
    }
  }

  private enableThemes() {
    this.disableThemes();
    const messageTrayContainer = getMessageTrayContainer();

    this.themeSignalId = messageTrayContainer?.connect("child-added", () => {
      if (!this.settingsManager.colorsEnabled) return;

      const widgets = resolveNotificationWidgets(messageTrayContainer);
      if (!widgets) return;

      const theme = this.settingsManager.getThemeFor(
        widgets.sourceName,
        widgets.titleText,
        widgets.bodyText,
      );
      if (!theme) return;

      applyNotificationTheme(widgets, theme);
    });
  }
}

function makeStyle(color: Color, fontSize: number): string {
  return `${makeColorStyle(color)} font-size: ${fontSize}px;`;
}

export function applyNotificationTheme(
  widgets: NotificationWidgets,
  theme: NotificationTheme,
) {
  widgets.source?.set_style(
    makeStyle(
      theme.appNameColor,
      theme.appNameFontSize ?? DEFAULT_THEME.appNameFontSize,
    ),
  );
  widgets.time?.set_style(
    makeStyle(
      theme.timeColor,
      theme.timeFontSize ?? DEFAULT_THEME.timeFontSize,
    ),
  );
  widgets.title?.set_style(
    makeStyle(
      theme.titleColor,
      theme.titleFontSize ?? DEFAULT_THEME.titleFontSize,
    ),
  );
  widgets.body?.set_style(
    makeStyle(
      theme.bodyColor,
      theme.bodyFontSize ?? DEFAULT_THEME.bodyFontSize,
    ),
  );

  const existingStyle = widgets.container?.get_style() ?? "";
  widgets.container?.set_style(
    `${existingStyle} ${makeColorStyle(theme.backgroundColor, "background")}`,
  );
}
