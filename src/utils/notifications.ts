import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import {
	FdoNotificationDaemonSource,
	GtkNotificationDaemonAppSource,
} from "resource:///org/gnome/shell/ui/notificationDaemon.js";

import {
	type Notification,
	Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";
import type { Position, SettingsManager } from "./settings.js";

export class NotificationsManager {
	private _processNotificationSource?: Source["addNotification"];
	private _processNotificationFdo?: FdoNotificationDaemonSource["processNotification"];
	private _processNotificationGtk?: GtkNotificationDaemonAppSource["addNotification"];

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
		const ensureRateLimited = this.ensureRateLimited.bind(this);
		const ensureFiltered = this.ensureFiltered.bind(this);

		const handleNotification = ((
			notification: Notification,
			source: string,
			push: () => void,
		) => {
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

			push();
		}).bind(this);

		const originalProcessNotification =
			FdoNotificationDaemonSource.prototype.processNotification;
		this._processNotificationFdo = originalProcessNotification;
		FdoNotificationDaemonSource.prototype.processNotification = function (
			notification,
			source: string,
			...rest
		) {
			handleNotification(notification, source, () => {
				originalProcessNotification.call(this, notification, source, ...rest);
			});
		};

		const originalAddNotification =
			GtkNotificationDaemonAppSource.prototype.addNotification;
		this._processNotificationGtk = originalAddNotification;
		GtkNotificationDaemonAppSource.prototype.addNotification = function (
			notification,
		) {
			handleNotification(
				notification,
				notification.source?.title ?? "UNK_SRC",
				() => {
					originalAddNotification.call(this, notification);
				},
			);
		};

		const originalSourceAddNotification = Source.prototype.addNotification;
		this._processNotificationSource = originalSourceAddNotification;
		Source.prototype.addNotification = function (notification) {
			handleNotification(
				notification,
				notification.source?.title ?? "UNK_SRC",
				() => {
					originalSourceAddNotification.call(this, notification);
				},
			);
		};
	}

	private stopProcessingNotifications() {
		if (this._processNotificationFdo) {
			FdoNotificationDaemonSource.prototype.processNotification =
				this._processNotificationFdo;
		}
		if (this._processNotificationGtk) {
			GtkNotificationDaemonAppSource.prototype.addNotification =
				this._processNotificationGtk;
		}
		if (this._processNotificationSource) {
			Source.prototype.addNotification = this._processNotificationSource;
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
