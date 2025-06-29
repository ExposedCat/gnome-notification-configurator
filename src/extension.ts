import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { NotificationsManager } from "./utils/notifications.js";
import { SettingsManager } from "./utils/settings.js";
import { ThemesManager } from "./utils/themes.js";

export default class NotificationConfiguratorExtension extends Extension {
	private settingsManager?: SettingsManager;
	private notificationsManager?: NotificationsManager;
	private themesManager?: ThemesManager;

	enable() {
		this.settingsManager = new SettingsManager(this.getSettings());
		this.notificationsManager = new NotificationsManager(this.settingsManager);
		this.themesManager = new ThemesManager(this.settingsManager);
	}

	disable() {
		this.settingsManager?.dispose();
		this.notificationsManager?.dispose();
		this.themesManager?.dispose();

		this.settingsManager = undefined;
		this.notificationsManager = undefined;
		this.themesManager = undefined;
	}
}
