import type { SettingsManager } from "../../utils/settings.js";
import type { AddNotificationHook } from "./manager.js";

export class ProcessingAdapter {
  private timings: Record<string, number> = {};

  constructor(private settingsManager: SettingsManager) {}

  createHook(): AddNotificationHook {
    const settingsManager = this.settingsManager;
    const timings = this.timings;

    return (_addNotification, notification, { block }) => {
      const sourceTitle = notification.source?.title ?? "UNK_SRC";
      const notificationTitle = notification.title ?? "";
      const notificationBody = notification.body ?? "";
      const configuration = settingsManager.getConfigurationFor(
        sourceTitle,
        notificationTitle,
        notificationBody,
      );

      if (!configuration.enabled) {
        return;
      }

      if (configuration.rateLimiting.enabled) {
        const threshold = configuration.rateLimiting.notificationThreshold;
        const lastNotification = timings[sourceTitle];

        if (lastNotification && Date.now() - lastNotification < threshold) {
          if (configuration.rateLimiting.action === "close") {
            block();
            return;
          }
          notification.acknowledged = true;
        } else {
          timings[sourceTitle] = Date.now();
        }
      }

      const filterAction = settingsManager.getFilterFor(
        sourceTitle,
        notificationTitle,
        notificationBody,
      );

      if (filterAction === "close") {
        block();
        return;
      }

      if (filterAction === "hide") {
        notification.acknowledged = true;
      }
    };
  }

  register(manager: import("./manager.js").SourceManager): void {
    manager.registerAddNotificationHook(this.createHook());
  }

  dispose(): void {
    this.timings = {};
  }
}
