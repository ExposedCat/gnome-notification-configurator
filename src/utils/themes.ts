import type Clutter from "gi://Clutter";
import type St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import type { SettingsManager } from "./settings.js";

export class ThemesManager {
	private themeSignalId?: number;

	constructor(private settingsManager: SettingsManager) {
		this.settingsManager = settingsManager;

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

	private enableThemes() {
		const messageTrayContainer = Main.messageTray.get_first_child();

		this.themeSignalId = messageTrayContainer?.connect("child-added", () => {
			if (!this.settingsManager?.colorsEnabled) return;

			const notificationContainer =
				messageTrayContainer?.get_first_child() as St.Widget | null;
			const notification = notificationContainer?.get_first_child();

			const appName = (
				notification // Content container
					?.get_first_child() // Header
					?.get_child_at_index(1) // Text container
					?.get_first_child() as Clutter.Text | null
			)?.text;
			if (!appName) return;

			const color = this.settingsManager.getColorFor(appName);
			if (!color) return;

			notificationContainer?.set_style(`background:${color};`);
		});
	}
}
