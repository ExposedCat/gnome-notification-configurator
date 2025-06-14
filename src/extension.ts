import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { NotificationsManager } from "./utils/notifications.js";
import { SettingsManager } from "./utils/settings.js";
import { ThemesManager } from "./utils/themes.js";

export default class NotificationConfiguratorExtension extends Extension {
	private settingsManager?: SettingsManager;
	private notificationsManager?: NotificationsManager;
	private themesManager?: ThemesManager;

	enable() {
		console.log("=== INIT");
		console.log("=== INIT settings");
		this.settingsManager = new SettingsManager(this.getSettings());
		console.log("=== INIT notifications");
		this.notificationsManager = new NotificationsManager(this.settingsManager);
		console.log("=== INIT themes");
		this.themesManager = new ThemesManager(this.settingsManager);
	}

	disable() {
		console.log("=== DISPOSE settings");
		this.settingsManager?.dispose();
		console.log("=== VOID settings");
		this.settingsManager = undefined;

		console.log("=== DISPOSE notifications");
		this.notificationsManager?.dispose();
		console.log("=== VOID notifications");
		this.notificationsManager = undefined;

		console.log("=== DISPOSE themes");
		this.themesManager?.dispose();
		console.log("=== VOID themes");
		this.themesManager = undefined;
	}
}
