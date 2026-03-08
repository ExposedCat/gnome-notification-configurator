import {
  type Notification,
  Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
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
  private injectionManager = new InjectionManager();

  private addNotificationHooks: AddNotificationHook[] = [];

  constructor(private settingsManager: SettingsManager) {}

  registerAddNotificationHook(hook: AddNotificationHook) {
    this.addNotificationHooks.push(hook);
  }

  enable() {
    this.patchAddNotification();
  }

  disable() {
    this.injectionManager.clear();
  }

  private patchAddNotification() {
    const hooks = this.addNotificationHooks;

    this.injectionManager.overrideMethod(
      Source.prototype,
      "addNotification",
      (original) =>
        function (this: Source, notification) {
          let handled = false;
          let blocked = false;

          for (const hook of hooks) {
            hook(
              (notificationToProcess) => {
                handled = true;
                original.call(this, notificationToProcess);
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
            original.call(this, notification);
          }
        },
    );
  }

  dispose() {
    this.disable();
    this.addNotificationHooks = [];
  }
}
