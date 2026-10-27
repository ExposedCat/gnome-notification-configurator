import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import {
  Notification,
  Sound,
} from "resource:///org/gnome/shell/ui/messageTray.js";
import type { Configuration, SettingsManager } from "../utils/settings.js";

type NotificationSound = Sound & {
  _soundName?: string;
  _soundFile?: Gio.File | null;
};

export class NotificationSoundManager {
  private injectionManager = new InjectionManager();
  private cancellable = new Gio.Cancellable();
  private notificationSettings = new Gio.Settings({
    schema_id: "org.gnome.desktop.notifications",
  });

  constructor(private settingsManager: SettingsManager) {
    const manager = this;

    this.injectionManager.overrideMethod(
      Notification.prototype,
      "playSound",
      (original) =>
        function (this: Notification) {
          const sound = this.sound as NotificationSound | null;
          if (
            sound &&
            (Object.getPrototypeOf(sound) !== Sound.prototype ||
              sound._soundName ||
              sound._soundFile)
          ) {
            original.call(this);
            return;
          }
          const fallback = manager.getSoundFor(this);
          if (!fallback) {
            original.call(this);
            return;
          }
          manager.playFallback(this, fallback);
        },
    );
  }

  private getSoundFor(
    notification: Notification,
  ): Configuration["sound"] | null {
    if (this.cancellable.is_cancelled()) return null;
    const configuration = this.settingsManager.getConfigurationFor(
      notification.source?.title ?? "",
      notification.title,
      notification.body,
    );
    return configuration.enabled &&
      configuration.sound.enabled &&
      notification.source?.policy.enableSound &&
      this.notificationSettings.get_boolean("show-banners")
      ? configuration.sound
      : null;
  }

  private playFallback(
    notification: Notification,
    sound: Configuration["sound"],
  ) {
    const play = (file: Gio.File | null) => {
      if (this.getSoundFor(notification)?.file !== sound.file) return;
      new Sound(file, file ? undefined : "message-new-instant").play();
    };
    if (!sound.file) {
      play(null);
      return;
    }
    const file = Gio.File.new_for_path(sound.file);
    let destroyed = false;
    const destroySignal = notification.connect("destroy", () => {
      destroyed = true;
    });
    file.query_info_async(
      "standard::type,access::can-read",
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      this.cancellable,
      (_queriedFile, result) => {
        if (!destroyed) notification.disconnect(destroySignal);
        try {
          const information = file.query_info_finish(result);
          if (destroyed) return;
          play(
            information.get_file_type() === Gio.FileType.REGULAR &&
              information.get_attribute_boolean("access::can-read")
              ? file
              : null,
          );
        } catch {
          if (!destroyed) play(null);
        }
      },
    );
  }

  dispose() {
    this.cancellable.cancel();
    this.injectionManager.clear();
  }
}
