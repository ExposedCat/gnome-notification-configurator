import type { SettingsManager } from "../../utils/settings.js";
import type { MessageTrayManager, UpdateStateHook } from "./manager.js";

export class IdleAdapter {
  constructor(private settingsManager: SettingsManager) {}

  createHook(): UpdateStateHook {
    const settingsManager = this.settingsManager;

    return (original, { tray }) => {
      const notification = tray._notification;
      const configuration = notification
        ? settingsManager.getConfigurationFor(
            notification.source?.title ?? "",
            notification.title,
            notification.body,
          )
        : null;
      if (
        configuration?.enabled &&
        configuration.timeout.enabled &&
        configuration.timeout.ignoreIdle
      ) {
        tray._userActiveWhileNotificationShown = true;
      }
      original();
    };
  }

  register(manager: MessageTrayManager): void {
    manager.registerUpdateStateHook(this.createHook());
  }
}
