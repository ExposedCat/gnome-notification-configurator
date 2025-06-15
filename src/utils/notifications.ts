import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { FdoNotificationDaemonSource } from "resource:///org/gnome/shell/ui/notificationDaemon.js";

import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";
import type { Position, SettingsManager } from "./settings.js";

export class NotificationsManager {
	private _processNotification?: FdoNotificationDaemonSource["processNotification"];

	private settingsManager: SettingsManager;
	private timings: Record<string, number> = {};

	constructor(settingsManager: SettingsManager) {
		this.settingsManager = settingsManager;

		this.startProcessingNotifications();

		settingsManager.events.on("notificationPositionChanged", (position) => {
			this.setPosition(position);
		});
		this.setPosition(settingsManager.notificationPosition);
	}

	dispose() {
		this.stopProcessingNotifications();
	}

	private startProcessingNotifications() {
		const originalProcessNotification =
			FdoNotificationDaemonSource.prototype.processNotification;
		this._processNotification = originalProcessNotification;

		const ensureRateLimited = this.ensureRateLimited.bind(this);
		const ensureFiltered = this.ensureFiltered.bind(this);

		FdoNotificationDaemonSource.prototype.processNotification = function (
			notification,
			source: string,
			...rest
		) {
			const rateLimited = ensureRateLimited(source);
			if (rateLimited) {
				notification.acknowledged = true;
			}

			const filtered = ensureFiltered(notification, source);
			if (filtered === "close") {
				return;
			}
			if (filtered === "hide") {
				notification.acknowledged = true;
			}

			originalProcessNotification.call(this, notification, source, ...rest);
		};
	}

	private stopProcessingNotifications() {
		if (this._processNotification) {
			FdoNotificationDaemonSource.prototype.processNotification =
				this._processNotification;
		}
	}

	private ensureRateLimited(source: string) {
		if (this.settingsManager?.rateLimitingEnabled) {
			const threshold = this.settingsManager.notificationThreshold;
			const lastNotification = this.timings[source];
			if (lastNotification && Date.now() - lastNotification < threshold) {
				return true;
			}
			this.timings[source] = Date.now();
		}
		return false;
	}

	private ensureFiltered(notification: Notification, source: string) {
		return (
			this.settingsManager.filteringEnabled &&
			this.settingsManager.getFilterFor(notification, source)
		);
	}

	private setPosition(position: Position) {
		Main.messageTray.bannerAlignment = {
			fill: Clutter.ActorAlign.FILL,
			left: Clutter.ActorAlign.START,
			right: Clutter.ActorAlign.END,
			center: Clutter.ActorAlign.CENTER,
		}[position];
	}
}
