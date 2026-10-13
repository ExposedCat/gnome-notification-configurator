import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { MessageTrayManager, UpdateStateHook } from "./manager.js";
import type { NotificationMonitor } from "./monitor.js";

export class FullscreenAdapter {
  constructor(
    private settingsManager: SettingsManager,
    private getMonitor: () => NotificationMonitor,
  ) {}

  createHook(): UpdateStateHook {
    return (original) => {
      const primaryMonitor = Main.layoutManager.primaryMonitor;
      const monitor = this.getMonitor();
      if (!primaryMonitor || !monitor) return;
      if (!this.settingsManager.fullscreenEnabled && monitor === primaryMonitor)
        return;

      const inFullscreen =
        !this.settingsManager.fullscreenEnabled && monitor.inFullscreen;
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        primaryMonitor,
        "inFullscreen",
      );
      Object.defineProperty(primaryMonitor, "inFullscreen", {
        get: () => inFullscreen,
        configurable: true,
      });

      try {
        original();
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(
            primaryMonitor,
            "inFullscreen",
            originalDescriptor,
          );
        } else {
          Reflect.deleteProperty(primaryMonitor, "inFullscreen");
        }
      }
    };
  }

  register(manager: MessageTrayManager): void {
    manager.registerUpdateStateHook(this.createHook());
  }
}
