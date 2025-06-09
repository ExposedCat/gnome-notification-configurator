import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as notificationDaemonModule from "resource:///org/gnome/shell/ui/notificationDaemon.js";

// TODO: Take from settings
const NOTIFICATION_THRESHOLD = 5_000;

// TODO: Proper types

export default class GnomeShellExtension extends Extension {
  private _processNotification!: () => void;
  private themeSignalId: number | null = null;

  private get notificationDaemonSourcePrototype() {
    return (notificationDaemonModule as any).FdoNotificationDaemonSource
      .prototype;
  }

  private timings: Record<string, number> = {};
  // TODO: Take from settings
  private colors: Record<string, string | undefined> = {
    telegram: "#0e1621",
  };

  enable() {
    this.enableRateLimit();
    this.enableThemes();
  }

  disable() {
    this.notificationDaemonSourcePrototype.processNotification =
      this._processNotification;

    if (this.themeSignalId !== null) {
      const messageTrayContainer = Main.messageTray.get_first_child()!;
      messageTrayContainer.disconnect(this.themeSignalId);
    }
  }

  private enableRateLimit() {
    const originalProcessNotification = (this._processNotification =
      this.notificationDaemonSourcePrototype.processNotification);

    const { timings } = this;

    this.notificationDaemonSourcePrototype.processNotification = function (
      notification: any,
      ...rest: any
    ) {
      const lastNotification = timings[notification.title];
      if (
        lastNotification &&
        Date.now() - lastNotification < NOTIFICATION_THRESHOLD
      ) {
        notification.acknowledged = true;
      } else {
        console.log(Object.keys(notification), notification);
        timings[notification.title] = Date.now();
      }
      originalProcessNotification.call(this, notification, ...rest);
    };
  }

  private enableThemes() {
    const messageTrayContainer = Main.messageTray.get_first_child()!;
    this.themeSignalId = messageTrayContainer.connect("child-added", () => {
      const notificationContainer =
        messageTrayContainer?.get_first_child() as any;

      const notification = notificationContainer?.get_first_child() as any;

      const appName = (
        notification // Content container
          ?.get_first_child() // Header
          ?.get_child_at_index(1) // Text container
          ?.get_first_child() as any
      )?.get_text() as string;

      const color = this.colors[appName];

      if (color) {
        notificationContainer?.set_style(`background:${color};`);
      }
    });
  }
}
