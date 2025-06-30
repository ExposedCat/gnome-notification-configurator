import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";

export type SetUrgencyHook = (
	original: (urgency: MessageTray.Urgency) => void,
	urgency: MessageTray.Urgency,
	context: { notification: MessageTray.NotificationProto },
) => MessageTray.Urgency;

export class NotificationManager {
	private _setUrgencyOrig?: (urgency: MessageTray.Urgency) => void;

	private setUrgencyHooks: SetUrgencyHook[] = [];

	constructor(private settingsManager: SettingsManager) {}

	registerSetUrgencyHook(hook: SetUrgencyHook) {
		this.setUrgencyHooks.push(hook);
	}

	enable() {
		this.patchSetUrgency();
	}

	disable() {
		this.restoreSetUrgency();
	}

	private patchSetUrgency() {
		const notificationProto = MessageTray.Notification
			.prototype as unknown as MessageTray.NotificationProto;

		this._setUrgencyOrig = notificationProto.setUrgency;

		const setUrgencyOrig = this._setUrgencyOrig;
		const hooks = this.setUrgencyHooks;

		notificationProto.setUrgency = function (urgency: MessageTray.Urgency) {
			let finalUrgency = urgency;

			for (const hook of hooks) {
				finalUrgency = hook(
					(urgency: MessageTray.Urgency) => setUrgencyOrig.call(this, urgency),
					finalUrgency,
					{ notification: this },
				);
			}

			return setUrgencyOrig.call(this, finalUrgency);
		};
	}

	private restoreSetUrgency() {
		const notificationProto = MessageTray.Notification
			.prototype as unknown as MessageTray.NotificationProto;

		if (this._setUrgencyOrig) {
			notificationProto.setUrgency = this._setUrgencyOrig;
			this._setUrgencyOrig = undefined;
		}
	}

	dispose() {
		this.disable();
		this.setUrgencyHooks = [];
	}
}
