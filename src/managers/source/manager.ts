import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import {
  type Notification,
  NotificationDestroyedReason,
  Source,
  type SourceProto,
} from "resource:///org/gnome/shell/ui/messageTray.js";
import {
  NOTIFICATIONS_PER_SOURCE_DEFAULT,
  type SettingsManager,
} from "../../utils/settings.js";

export type AddNotificationHook = (
  addNotification: (notification: Notification) => void,
  notification: Notification,
  context: {
    source: Source;
    block: () => void;
  },
) => void;

export class SourceManager {
  private injectionManager = new InjectionManager();

  private addNotificationHooks: AddNotificationHook[] = [];

  constructor(private settingsManager: SettingsManager) { }

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
    const manager = this;

    this.injectionManager.overrideMethod(
      Source.prototype,
      "addNotification",
      () =>
        function (this: Source, notification) {
          let handled = false;
          let blocked = false;

          const addNotification = (notificationToAdd: Notification) => {
            handled = true;
            manager.addNotification(
              this,
              notificationToAdd,
              manager.getMaximumPerSource(this, notificationToAdd),
            );
          };

          for (const hook of hooks) {
            hook(addNotification, notification, {
              source: this,
              block: () => {
                blocked = true;
              },
            });

            if (blocked) {
              return;
            }
          }

          if (!handled && !blocked) {
            addNotification(notification);
          }
        },
    );
  }

  private getMaximumPerSource(source: Source, notification: Notification) {
    const configuration = this.settingsManager.getConfigurationFor(
      notification.source?.title ?? source.title,
      notification.title,
      notification.body,
    );
    const maximumPerSource = configuration.enabled
      ? configuration.notificationCenter.maximumPerSource
      : NOTIFICATIONS_PER_SOURCE_DEFAULT;
    return maximumPerSource > 0
      ? Math.trunc(maximumPerSource)
      : NOTIFICATIONS_PER_SOURCE_DEFAULT;
  }

  private addNotification(
    source: SourceProto,
    notification: Notification,
    maximumPerSource: number,
  ) {
    // Adapted from GNOME Shell js/ui/messageTray.js Source.addNotification().
    if (source.notifications.includes(notification)) {
      return;
    }

    while (source.notifications.length >= maximumPerSource) {
      const [oldestNotification] = source.notifications;
      oldestNotification.destroy(NotificationDestroyedReason.EXPIRED);
    }

    notification.connect("destroy", source._onNotificationDestroy.bind(source));
    notification.connect("notify::acknowledged", () => {
      source.countUpdated();

      if (!notification.acknowledged) {
        source.emit("notification-request-banner", notification);
      }
    });
    source.notifications.push(notification);

    source.emit("notification-added", notification);
    source.emit("notification-request-banner", notification);
    source.countUpdated();
  }

  dispose() {
    this.disable();
    this.addNotificationHooks = [];
  }
}
