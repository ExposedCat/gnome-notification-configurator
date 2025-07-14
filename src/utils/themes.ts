import type Clutter from "gi://Clutter";
import type St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
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
			const messageTrayContainer = Main.messageTray.get_first_child();
			messageTrayContainer?.disconnect(this.themeSignalId);
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
		const messageTrayContainer = Main.messageTray.get_first_child();

		this.themeSignalId = messageTrayContainer?.connect("child-added", () => {
			if (!this.settingsManager.colorsEnabled) return;

			const notificationContainer =
				messageTrayContainer?.get_first_child() as St.Widget | null;
			const notification = notificationContainer?.get_first_child();

			const header = notification?.get_child_at_index(0);
			const headerContent = header?.get_child_at_index(
				1,
			) as St.BoxLayout | null;
			const headerContentSource = headerContent?.get_child_at_index(
				0,
			) as St.Bin;
			const headerContentSourceText =
				headerContentSource?.get_first_child() as Clutter.Text;

			if (!headerContentSourceText) return;
			const theme = this.settingsManager.getThemeFor(
				headerContentSourceText.text,
			);
			if (!theme) return;

			const headerContentTime = headerContent?.get_child_at_index(1) as St.Bin;

			const content = notification?.get_child_at_index(1);
			const contentContent = content?.get_child_at_index(
				1,
			) as St.BoxLayout | null;
			const contentContentTitle = contentContent?.get_child_at_index(
				0,
			) as St.Bin;
			const contentContentBody = contentContent?.get_child_at_index(
				1,
			) as St.Bin;

			headerContentSource?.set_style(
				this.makeStyle(
					theme.appNameColor,
					theme.appNameFontSize ?? DEFAULT_THEME.appNameFontSize,
				),
			);
			headerContentTime?.set_style(
				this.makeStyle(
					theme.timeColor,
					theme.timeFontSize ?? DEFAULT_THEME.timeFontSize,
				),
			);
			contentContentTitle?.set_style(
				this.makeStyle(
					theme.titleColor,
					theme.titleFontSize ?? DEFAULT_THEME.titleFontSize,
				),
			);
			contentContentBody?.set_style(
				this.makeStyle(
					theme.bodyColor,
					theme.bodyFontSize ?? DEFAULT_THEME.bodyFontSize,
				),
			);

			notificationContainer?.set_style(
				this.makeColorStyle(theme.backgroundColor, "background"),
			);
		});
	}
}
