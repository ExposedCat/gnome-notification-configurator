import {
	type Notification,
	Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";

export type AddNotificationHook = (
	original: (notification: Notification) => void,
	notification: Notification,
	context: {
		source: Source;
		block: () => void;
	},
) => void;

export class SourceManager {
	private _addNotificationOrig?: Source["addNotification"];

	private addNotificationHooks: AddNotificationHook[] = [];

	constructor(private settingsManager: SettingsManager) {}

	registerAddNotificationHook(hook: AddNotificationHook) {
		this.addNotificationHooks.push(hook);
	}

	enable() {
		this.patchAddNotification();
	}

	disable() {
		this.restoreAddNotification();
	}

	private patchAddNotification() {
		this._addNotificationOrig = Source.prototype.addNotification;

		const addNotificationOrig = this._addNotificationOrig;
		const hooks = this.addNotificationHooks;

		Source.prototype.addNotification = function (notification: Notification) {
			let handled = false;
			let blocked = false;

			for (const hook of hooks) {
				hook(
					(notificationToProcess: Notification) => {
						handled = true;
						addNotificationOrig.call(this, notificationToProcess);
					},
					notification,
					{
						source: this,
						block: () => {
							blocked = true;
						},
					},
				);

				if (blocked) {
					return;
				}
			}

			if (!handled && !blocked) {
				addNotificationOrig.call(this, notification);
			}
		};
	}

	private restoreAddNotification() {
		if (this._addNotificationOrig) {
			Source.prototype.addNotification = this._addNotificationOrig;
			this._addNotificationOrig = undefined;
		}
	}

	dispose() {
		this.disable();
		this.addNotificationHooks = [];
	}
}
