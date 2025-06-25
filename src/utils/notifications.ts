import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
	type Notification,
	Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";
import type { Position, SettingsManager } from "./settings.js";

export class NotificationsManager {
	private _processNotificationSource?: Source["addNotification"];
	private _updateState?: () => void;
	private _processingFullscreen = false;

	private settingsManager: SettingsManager;
	private timings: Record<string, number> = {};

	constructor(settingsManager: SettingsManager) {
		this.settingsManager = settingsManager;

		this.startProcessingNotifications();

		settingsManager.events.on("notificationPositionChanged", (position) => {
			this.setPosition(position);
		});
		this.setPosition(settingsManager.notificationPosition);

		settingsManager.events.on("fullscreenEnabledChanged", (enabled) => {
			if (enabled !== this._processingFullscreen) {
				this.setFullscreenProcessing(enabled);
			}
		});
		this.setFullscreenProcessing(this.settingsManager.fullscreenEnabled);
	}

	dispose() {
		this.stopProcessingNotifications();
		this.setFullscreenProcessing(false);
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
		if (this._processNotificationSource) {
			Source.prototype.addNotification = this._processNotificationSource;
		}
		if (this._updateState) {
			this.unsafeMessageTray._updateState = this._updateState;
		}
	}

	private get unsafeMessageTray() {
		// biome-ignore lint/suspicious/noExplicitAny: explicitly unsafe
		return Main.messageTray as any as {
			_updateState: (this: typeof Main.messageTray) => void;
		};
	}

	private setFullscreenProcessing(enabled: boolean) {
		this._processingFullscreen = enabled;
		if (!enabled) {
			if (this._updateState) {
				this.unsafeMessageTray._updateState = this._updateState;
			}
			return;
		}

		this._updateState = this.unsafeMessageTray._updateState;

		const monitorProto = Object.getPrototypeOf(
			Main.layoutManager.primaryMonitor,
		);
		// biome-ignore lint/style/noNonNullAssertion: it's present in supported shell versions
		const originalDescriptor = Object.getOwnPropertyDescriptor(
			monitorProto,
			"inFullscreen",
		)!;
		const updateState = this._updateState;

		this.unsafeMessageTray._updateState = function () {
			Object.defineProperty(monitorProto, "inFullscreen", {
				get: () => false,
				configurable: true,
			});
			try {
				return updateState.call(this);
			} finally {
				Object.defineProperty(monitorProto, "inFullscreen", originalDescriptor);
			}
		};
	}

	private ensureRateLimited(source: string) {
		if (this.settingsManager?.rateLimitingEnabled) {
			const threshold = this.settingsManager.notificationThreshold;
			const lastNotification = this.timings[source];
			if (lastNotification && Date.now() - lastNotification < threshold) {
				return true;
			}
			this.timings[source] = Date.now();
			return false;
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
