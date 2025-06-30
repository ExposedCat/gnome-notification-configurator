import type { SettingsManager } from "../../utils/settings.js";
import type { UpdateStateHook } from "./manager.js";

export class IdleAdapter {
	private listenerId?: number;

	constructor(private settingsManager: SettingsManager) {}

	createHook(): UpdateStateHook {
		const settingsManager = this.settingsManager;

		return (original, { tray }) => {
			if (settingsManager.ignoreIdle) {
				tray._userActiveWhileNotificationShown = true;
			}
			original();
		};
	}

	register(manager: import("./manager.js").MessageTrayManager): void {
		this.listenerId = this.settingsManager.events.on(
			"ignoreIdleChanged",
			() => {},
		);

		manager.registerUpdateStateHook(this.createHook());
	}

	dispose(): void {
		if (this.listenerId !== undefined) {
			this.settingsManager.events.off(this.listenerId);
			this.listenerId = undefined;
		}
	}
}
