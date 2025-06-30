import type { SettingsManager } from "../../utils/settings.js";
import type { UpdateNotificationTimeoutHook } from "./manager.js";

export class TimeoutAdapter {
	private listenerId?: number;

	constructor(private settingsManager: SettingsManager) {}

	createHook(): UpdateNotificationTimeoutHook {
		const settingsManager = this.settingsManager;

		return (_original, timeout) => {
			if (timeout > 0) {
				return settingsManager.notificationTimeout;
			}

			return timeout;
		};
	}

	register(manager: import("./manager.js").MessageTrayManager): void {
		this.listenerId = this.settingsManager.events.on(
			"notificationTimeoutChanged",
			() => {},
		);

		manager.registerUpdateNotificationTimeoutHook(this.createHook());
	}

	dispose(): void {
		if (this.listenerId !== undefined) {
			this.settingsManager.events.off(this.listenerId);
			this.listenerId = undefined;
		}
	}
}
