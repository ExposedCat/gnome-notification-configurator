import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { UpdateStateHook } from "./manager.js";

export class FullscreenAdapter {
	private listenerId?: number;

	constructor(private settingsManager: SettingsManager) {}

	createHook(): UpdateStateHook {
		const settingsManager = this.settingsManager;

		return (original) => {
			if (!settingsManager.fullscreenEnabled) {
				return;
			}

			const monitorProto = Object.getPrototypeOf(
				Main.layoutManager.primaryMonitor,
			);

			// biome-ignore lint/style/noNonNullAssertion: it's present in supported shell versions
			const originalDescriptor = Object.getOwnPropertyDescriptor(
				monitorProto,
				"inFullscreen",
			)!;

			Object.defineProperty(monitorProto, "inFullscreen", {
				get: () => false,
				configurable: true,
			});

			try {
				original();
			} finally {
				Object.defineProperty(monitorProto, "inFullscreen", originalDescriptor);
			}
		};
	}

	register(manager: import("./manager.js").MessageTrayManager): void {
		this.listenerId = this.settingsManager.events.on(
			"fullscreenEnabledChanged",
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
