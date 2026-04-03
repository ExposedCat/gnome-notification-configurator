import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { WindowAttentionHook, WindowAttentionManager } from "./manager.js";

export class ActivateAdapter {
  constructor(private settingsManager: SettingsManager) {}

  createHook(): WindowAttentionHook {
    const settingsManager = this.settingsManager;

    return (original, window) => {
      console.log("[ActivateAdapter] hook invoked");
      console.log(
        `[ActivateAdapter] checking setting: activateWindowOnAttention=${settingsManager.activateWindowOnAttention}`,
      );

      if (!settingsManager.activateWindowOnAttention) {
        console.log("[ActivateAdapter] setting is off — calling original");
        original();
        return;
      }

      console.log("[ActivateAdapter] setting is on — inspecting window");

      const title = window?.get_title();
      const windowId = window?.get_id();
      const windowClass = window?.get_wm_class();
      const hasFocus = window?.has_focus();
      const skipTaskbar = window?.is_skip_taskbar();

      console.log(
        `[ActivateAdapter] window: id=${windowId} title="${title}" wm_class="${windowClass}" has_focus=${hasFocus} skip_taskbar=${skipTaskbar}`,
      );

      if (!window) {
        console.log("[ActivateAdapter] window is null — doing nothing");
        return;
      }

      if (hasFocus) {
        console.log("[ActivateAdapter] window already has focus — doing nothing");
        return;
      }

      if (skipTaskbar) {
        console.log("[ActivateAdapter] window is skip-taskbar — doing nothing");
        return;
      }

      console.log(
        `[ActivateAdapter] calling Main.activateWindow for id=${windowId} title="${title}"`,
      );
      Main.activateWindow(window);
      console.log("[ActivateAdapter] Main.activateWindow returned");
    };
  }

  register(manager: WindowAttentionManager): void {
    manager.registerHook(this.createHook());
  }

  dispose(): void {}
}
