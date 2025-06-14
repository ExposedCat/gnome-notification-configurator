import { FdoNotificationDaemonSource } from "resource:///org/gnome/shell/ui/notificationDaemon.js";

import type { SettingsManager } from "./settings.js";

export class NotificationsManager {
	private _processNotification?: FdoNotificationDaemonSource["processNotification"];

	private settingsManager: SettingsManager;
	private timings: Record<string, number> = {};

	constructor(settingsManager: SettingsManager) {
		this.settingsManager = settingsManager;

		settingsManager.events.on("rateLimitingEnabledChanged", (enabled) => {
			if (enabled) {
				this.enableRateLimit();
			} else {
				this.disableRateLimit();
			}
		});
		if (settingsManager.rateLimitingEnabled) {
			this.enableRateLimit();
		}
	}

	dispose() {
		this.disableRateLimit();
	}

	private disableRateLimit() {
		if (this._processNotification) {
			FdoNotificationDaemonSource.prototype.processNotification =
				this._processNotification;
		}
	}

	private enableRateLimit() {
		const originalProcessNotification =
			FdoNotificationDaemonSource.prototype.processNotification;
		this._processNotification = originalProcessNotification;

		const { timings, settingsManager } = this;

		FdoNotificationDaemonSource.prototype.processNotification = function (
			notification,
			...rest
		) {
			const source = rest[0];

			if (settingsManager?.rateLimitingEnabled) {
				const threshold = settingsManager.notificationThreshold;
				const lastNotification = timings[source];
				if (lastNotification && Date.now() - lastNotification < threshold) {
					notification.acknowledged = true;
				} else {
					timings[source] = Date.now();
				}
			} else {
				timings[source] = Date.now();
			}
			originalProcessNotification.call(this, notification, ...rest);
		};
	}
}
