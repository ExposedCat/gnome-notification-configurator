import {
  getMessageTrayContainer,
  resolveNotificationWidgets,
} from "../shell/notification-widgets.js";
import { DEFAULT_THEME } from "./constants.js";
import type { SettingsManager } from "./settings.js";

type Color = number[];

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

  private makeColorStyle(
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

  private makeFontSizeStyle(fontSize: number): string {
    return `font-size: ${fontSize}px;`;
  }

  private makeStyle(
    color: Color,
    fontSize: number,
    kind: "color" | "background" = "color",
  ): string {
    if (kind === "background") {
      return this.makeColorStyle(color, kind);
    }

    const colorStyle = this.makeColorStyle(color, kind);
    const fontSizeStyle = this.makeFontSizeStyle(fontSize);
    return `${colorStyle} ${fontSizeStyle}`;
  }

  private enableThemes() {
    const messageTrayContainer = getMessageTrayContainer();

    this.themeSignalId = messageTrayContainer?.connect("child-added", () => {
      if (!this.settingsManager.colorsEnabled) return;

      const widgets = resolveNotificationWidgets(messageTrayContainer);
      if (!widgets) return;

      const theme = this.settingsManager.getThemeFor(widgets.sourceText.text);
      if (!theme) return;

      widgets.source?.set_style(
        this.makeStyle(
          theme.appNameColor,
          theme.appNameFontSize ?? DEFAULT_THEME.appNameFontSize,
        ),
      );
      widgets.time?.set_style(
        this.makeStyle(
          theme.timeColor,
          theme.timeFontSize ?? DEFAULT_THEME.timeFontSize,
        ),
      );
      widgets.title?.set_style(
        this.makeStyle(
          theme.titleColor,
          theme.titleFontSize ?? DEFAULT_THEME.titleFontSize,
        ),
      );
      widgets.body?.set_style(
        this.makeStyle(
          theme.bodyColor,
          theme.bodyFontSize ?? DEFAULT_THEME.bodyFontSize,
        ),
      );

      widgets.container?.set_style(
        this.makeColorStyle(theme.backgroundColor, "background"),
      );
    });
  }
}
