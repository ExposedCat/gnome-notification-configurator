import type { SettingsManager } from "../../utils/settings.js";
import type {
  MessageTrayManager,
  UpdateNotificationTimeoutHook,
} from "./manager.js";

export class TimeoutAdapter {
  constructor(private settingsManager: SettingsManager) {}

  createHook(): UpdateNotificationTimeoutHook {
    const settingsManager = this.settingsManager;

    return (_original, timeout, { tray }) => {
      const notification = tray._notification;
      const configuration = notification
        ? settingsManager.getConfigurationFor(
            notification.source?.title ?? "",
            notification.title,
            notification.body,
          )
        : null;
      if (timeout !== null && timeout > 0) {
        if (!configuration?.enabled || !configuration.timeout.enabled)
          return timeout;
        return configuration.timeout.notificationTimeout > 0
          ? configuration.timeout.notificationTimeout
          : null;
      }

      return timeout;
    };
  }

  register(manager: MessageTrayManager): void {
    manager.registerUpdateNotificationTimeoutHook(this.createHook());
  }
}
