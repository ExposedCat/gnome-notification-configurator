import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
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
  private injectionManager = new InjectionManager();

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
    this.injectionManager.clear();
  }

  private patchUpdateState() {
    const messageTrayProto = MessageTray.MessageTray
      .prototype as unknown as MessageTray.MessageTrayProto;

    const hooks = this.updateStateHooks;

    this.injectionManager.overrideMethod(
      messageTrayProto,
      "_updateState",
      (original) =>
        function (this: MessageTray.MessageTrayProto) {
          let originalCalled = false;

          for (const hook of hooks) {
            hook(
              () => {
                if (!originalCalled) {
                  originalCalled = true;
                  return original.call(this);
                }
              },
              { tray: this },
            );
          }

          if (!originalCalled) {
            return original.call(this);
          }
        },
    );
  }

  private patchUpdateNotificationTimeout() {
    const messageTrayProto = MessageTray.MessageTray
      .prototype as unknown as MessageTray.MessageTrayProto;

    const hooks = this.updateNotificationTimeoutHooks;

    this.injectionManager.overrideMethod(
      messageTrayProto,
      "_updateNotificationTimeout",
      (original) =>
        function (this: MessageTray.MessageTrayProto, timeout: number) {
          let finalTimeout: number | null = timeout;

          for (const hook of hooks) {
            finalTimeout = hook(
              (timeout: number) => original.call(this, timeout),
              finalTimeout,
              { tray: this },
            );
            if (finalTimeout === null) {
              break;
            }
          }

          if (finalTimeout !== null) {
            return original.call(this, finalTimeout);
          }
        },
    );
  }

  dispose() {
    this.disable();
    this.updateStateHooks = [];
    this.updateNotificationTimeoutHooks = [];
  }
}
