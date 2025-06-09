import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as notificationDaemonModule from "resource:///org/gnome/shell/ui/notificationDaemon.js";
import Gio from "gi://Gio";

// TODO: Proper types

export default class GnomeShellExtension extends Extension {
  private _processNotification!: () => void;
  private themeSignalId: number | null = null;
  private settings!: Gio.Settings;

  private get notificationDaemonSourcePrototype() {
    return (notificationDaemonModule as any).FdoNotificationDaemonSource
      .prototype;
  }

  private timings: Record<string, number> = {};

  enable() {
    this.settings = this.getSettings();
    this.enableRateLimit();
    this.enableThemes();
  }

  disable() {
    this.notificationDaemonSourcePrototype.processNotification =
      this._processNotification;

    if (this.themeSignalId !== null) {
      const messageTrayContainer = Main.messageTray.get_first_child()!;
      messageTrayContainer.disconnect(this.themeSignalId);
      this.themeSignalId = null;
    }

    this.settings = null!;
  }

  private enableRateLimit() {
    const originalProcessNotification = (this._processNotification =
      this.notificationDaemonSourcePrototype.processNotification);

    const { timings } = this;
    const extension = this;

    this.notificationDaemonSourcePrototype.processNotification = function (
      notification: any,
      ...rest: any
    ) {
      const source = rest[0];

      if (extension.settings.get_boolean("enable-rate-limiting")) {
        const threshold = extension.settings.get_int("notification-threshold");
        const lastNotification = timings[source];
        if (lastNotification && Date.now() - lastNotification < threshold) {
          notification.acknowledged = true;
        } else {
          timings[source] = Date.now();
        }
      } else {
        timings[source] = Date.now();
      }
      originalProcessNotification.call(this, notification, ...rest);
    };
  }

  private enableThemes() {
    const messageTrayContainer = Main.messageTray.get_first_child()!;

    this.themeSignalId = messageTrayContainer.connect("child-added", () => {
      if (!this.settings.get_boolean("enable-custom-colors")) {
        return;
      }

      const notificationContainer =
        messageTrayContainer?.get_first_child() as any;

      const notification = notificationContainer?.get_first_child() as any;

      const appName = (
        notification // Content container
          ?.get_first_child() // Header
          ?.get_child_at_index(1) // Text container
          ?.get_first_child() as any
      )?.get_text() as string;

      const color = this.getColorForApp(appName);

      if (color) {
        notificationContainer?.set_style(`background:${color};`);
      }
    });
  }

  private getColorForApp(appName: string): string | null {
    if (!appName) return null;

    const appNameLower = appName.toLowerCase();

    try {
      const appColorsJson = this.settings.get_string("app-colors");
      const appColors = JSON.parse(appColorsJson);

      for (const [app, color] of Object.entries(appColors)) {
        if (
          appNameLower.includes(app.toLowerCase()) ||
          app.toLowerCase().includes(appNameLower)
        ) {
          return color as string;
        }
      }
    } catch (error) {
      console.error("Error parsing app-colors JSON:", error);
    }

    return null;
  }
}
