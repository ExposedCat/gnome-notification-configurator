import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { AddNotificationHook } from "./manager.js";

export class UrgencyAdapter {
	constructor(private settingsManager: SettingsManager) {}

	createHook(): AddNotificationHook {
		const settingsManager = this.settingsManager;

		return (_original, notification, _ctx) => {
			if (settingsManager.notificationTimeout === 0) {
				notification.urgency = MessageTray.Urgency.CRITICAL;
			} else if (settingsManager.alwaysNormalUrgency) {
				notification.urgency = MessageTray.Urgency.NORMAL;
			}
		};
	}

	register(manager: import("./manager.js").SourceManager): void {
		manager.registerAddNotificationHook(this.createHook());
	}

	dispose(): void {}
}
