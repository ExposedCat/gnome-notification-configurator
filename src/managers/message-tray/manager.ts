import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";

export type UpdateStateHook = (
	original: () => void,
	context: { tray: MessageTray.MessageTrayProto },
) => void;

export type UpdateNotificationTimeoutHook = (
	original: (timeout: number) => void,
	timeout: number | null,
	context: { tray: MessageTray.MessageTrayProto },
) => number | null;

export class MessageTrayManager {
	private _updateStateOrig?: () => void;
	private _updateNotificationTimeoutOrig?: (timeout: number) => void;

	private updateStateHooks: UpdateStateHook[] = [];
	private updateNotificationTimeoutHooks: UpdateNotificationTimeoutHook[] = [];

	constructor(private settingsManager: SettingsManager) {}

	registerUpdateStateHook(hook: UpdateStateHook) {
		this.updateStateHooks.push(hook);
	}

	registerUpdateNotificationTimeoutHook(hook: UpdateNotificationTimeoutHook) {
		this.updateNotificationTimeoutHooks.push(hook);
	}

	enable() {
		this.patchUpdateState();
		this.patchUpdateNotificationTimeout();
	}

	disable() {
		this.restoreUpdateState();
		this.restoreUpdateNotificationTimeout();
	}

	private patchUpdateState() {
		const messageTrayProto = MessageTray.MessageTray
			.prototype as unknown as MessageTray.MessageTrayProto;

		this._updateStateOrig = messageTrayProto._updateState;

		const updateStateOrig = this._updateStateOrig;
		const hooks = this.updateStateHooks;

		messageTrayProto._updateState = function (
			this: MessageTray.MessageTrayProto,
		) {
			let originalCalled = false;

			for (const hook of hooks) {
				hook(
					() => {
						if (!originalCalled) {
							originalCalled = true;
							return updateStateOrig.call(this);
						}
					},
					{ tray: this },
				);
			}

			if (!originalCalled) {
				return updateStateOrig.call(this);
			}
		};
	}

	private restoreUpdateState() {
		const messageTrayProto = MessageTray.MessageTray
			.prototype as unknown as MessageTray.MessageTrayProto;

		if (this._updateStateOrig) {
			messageTrayProto._updateState = this._updateStateOrig;
			this._updateStateOrig = undefined;
		}
	}

	private patchUpdateNotificationTimeout() {
		const messageTrayProto = MessageTray.MessageTray
			.prototype as unknown as MessageTray.MessageTrayProto;

		this._updateNotificationTimeoutOrig =
			messageTrayProto._updateNotificationTimeout;

		const updateTimeoutOrig = this._updateNotificationTimeoutOrig;
		const hooks = this.updateNotificationTimeoutHooks;

		messageTrayProto._updateNotificationTimeout = function (timeout: number) {
			let finalTimeout: number | null = timeout;

			for (const hook of hooks) {
				finalTimeout = hook(
					(timeout: number) => updateTimeoutOrig.call(this, timeout),
					finalTimeout,
					{ tray: this },
				);
				if (finalTimeout === null) {
					break;
				}
			}

			if (finalTimeout !== null) {
				return updateTimeoutOrig.call(this, finalTimeout);
			}
		};
	}

	private restoreUpdateNotificationTimeout() {
		const messageTrayProto = MessageTray.MessageTray
			.prototype as unknown as MessageTray.MessageTrayProto;

		if (this._updateNotificationTimeoutOrig) {
			messageTrayProto._updateNotificationTimeout =
				this._updateNotificationTimeoutOrig;
			this._updateNotificationTimeoutOrig = undefined;
		}
	}

	dispose() {
		this.disable();
		this.updateStateHooks = [];
		this.updateNotificationTimeoutHooks = [];
	}
}
