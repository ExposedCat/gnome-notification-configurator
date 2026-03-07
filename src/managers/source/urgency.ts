import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { AddNotificationHook } from "./manager.js";

export class UrgencyAdapter {
  constructor(private settingsManager: SettingsManager) {}

  createHook(): AddNotificationHook {
    const settingsManager = this.settingsManager;

    return (_original, notification, _ctx) => {
      const sourceTitle = notification.source?.title ?? "UNK_SRC";
      const configuration = settingsManager.getConfigurationFor(
        sourceTitle,
        notification.title ?? "",
        notification.body ?? "",
      );

      if (!configuration.enabled) {
        return;
      }

      if (
        configuration.timeout.enabled &&
        configuration.timeout.notificationTimeout === 0
      ) {
        notification.urgency = MessageTray.Urgency.CRITICAL;
      } else if (configuration.urgency.alwaysNormalUrgency) {
        notification.urgency = MessageTray.Urgency.NORMAL;
      }
    };
  }

  register(manager: import("./manager.js").SourceManager): void {
    manager.registerAddNotificationHook(this.createHook());
  }

  dispose(): void {}
}
