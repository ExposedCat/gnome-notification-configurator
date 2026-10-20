import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { migrateRegexSchema } from "./migrations/regex.js";
import { MediaPlayerManager } from "./shell/media-player.js";
import { NotificationsManager } from "./shell/notifications.js";
import { TopBarManager } from "./shell/top-bar.js";

import { SettingsManager } from "./utils/settings.js";
import { ThemesManager } from "./utils/themes.js";

export default class NotificationConfiguratorExtension extends Extension {
  private settingsManager?: SettingsManager;
  private notificationsManager?: NotificationsManager;
  private themesManager?: ThemesManager;
  private topBarManager?: TopBarManager;
  private mediaPlayerManager?: MediaPlayerManager;

  enable() {
    const settings = this.getSettings();

    migrateRegexSchema(settings);

    this.settingsManager = new SettingsManager(settings);
    this.notificationsManager = new NotificationsManager(this.settingsManager);
    this.themesManager = new ThemesManager(this.settingsManager);
    this.topBarManager = new TopBarManager(this.settingsManager);
    this.mediaPlayerManager = new MediaPlayerManager(this.settingsManager);
  }

  disable() {
    this.mediaPlayerManager?.dispose();
    this.settingsManager?.dispose();
    this.notificationsManager?.dispose();
    this.themesManager?.dispose();
    this.topBarManager?.dispose();

    this.settingsManager = undefined;
    this.notificationsManager = undefined;
    this.themesManager = undefined;
    this.topBarManager = undefined;
    this.mediaPlayerManager = undefined;
  }
}
