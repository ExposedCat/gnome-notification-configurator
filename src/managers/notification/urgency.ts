import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { SetUrgencyHook } from "./manager.js";

export class UrgencyAdapter {
	private listenerId1?: number;
	private listenerId2?: number;

	constructor(private settingsManager: SettingsManager) {}

	createHook(): SetUrgencyHook {
		const settingsManager = this.settingsManager;

		return (_original, urgency) => {
			if (settingsManager.notificationTimeout === 0) {
				return MessageTray.Urgency.CRITICAL;
			}

			if (settingsManager.alwaysNormalUrgency) {
				return MessageTray.Urgency.NORMAL;
			}

			return urgency;
		};
	}

	register(manager: import("./manager.js").NotificationManager): void {
		this.listenerId1 = this.settingsManager.events.on(
			"notificationTimeoutChanged",
			() => {},
		);

		this.listenerId2 = this.settingsManager.events.on(
			"alwaysNormalUrgencyChanged",
			() => {},
		);

		manager.registerSetUrgencyHook(this.createHook());
	}

	dispose(): void {
		if (this.listenerId1 !== undefined) {
			this.settingsManager.events.off(this.listenerId1);
			this.listenerId1 = undefined;
		}

		if (this.listenerId2 !== undefined) {
			this.settingsManager.events.off(this.listenerId2);
			this.listenerId2 = undefined;
		}
	}
}
