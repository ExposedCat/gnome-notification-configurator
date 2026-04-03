import type Meta from "gi://Meta";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export type WindowAttentionHook = (
  original: () => void,
  window: Meta.Window,
) => void;

type WindowAttentionHandlerProto = {
  _onWindowDemandsAttention: (
    display: Meta.Display,
    window: Meta.Window,
  ) => void;
};

export class WindowAttentionManager {
  private injectionManager = new InjectionManager();
  private hooks: WindowAttentionHook[] = [];

  registerHook(hook: WindowAttentionHook) {
    this.hooks.push(hook);
  }

  enable() {
    this.patchHandler();
    this.reconnectSignals();
  }

  disable() {
    console.log("[WindowAttentionManager] disable: restoring original handler");
    this.injectionManager.clear();
  }

  private patchHandler() {
    const proto = Object.getPrototypeOf(
      Main.windowAttentionHandler,
    ) as unknown as WindowAttentionHandlerProto;

    const hooks = this.hooks;

    console.log("[WindowAttentionManager] patching _onWindowDemandsAttention");

    this.injectionManager.overrideMethod(
      proto,
      "_onWindowDemandsAttention",
      (original) =>
        function (
          this: WindowAttentionHandlerProto,
          display: Meta.Display,
          window: Meta.Window,
        ) {
          const title = window?.get_title();
          const windowId = window?.get_id();
          const hasFocus = window?.has_focus();
          const skipTaskbar = window?.is_skip_taskbar();

          console.log(
            `[WindowAttentionManager] injected _onWindowDemandsAttention called: id=${windowId} title="${title}" has_focus=${hasFocus} skip_taskbar=${skipTaskbar} hooks=${hooks.length}`,
          );

          let handled = false;

          for (const [index, hook] of hooks.entries()) {
            console.log(`[WindowAttentionManager] running hook ${index}`);
            hook(() => {
              console.log(
                `[WindowAttentionManager] hook ${index} called original`,
              );
              handled = true;
              original.call(this, display, window);
            }, window);

            console.log(
              `[WindowAttentionManager] hook ${index} done, handled=${handled}`,
            );

            if (handled) break;
          }

          if (!handled) {
            console.log(
              "[WindowAttentionManager] no hook handled — falling back to original",
            );
            original.call(this, display, window);
          }
        },
    );
  }

  private reconnectSignals() {
    const attentionHandler = Main.windowAttentionHandler;

    console.log(
      `[WindowAttentionManager] reconnectSignals: demandsId=${attentionHandler._windowDemandsAttentionId} urgentId=${attentionHandler._windowMarkedUrgentId}`,
    );

    if (
      !attentionHandler._windowDemandsAttentionId ||
      !attentionHandler._windowMarkedUrgentId
    ) {
      console.error(
        "[WindowAttentionManager] signal IDs missing or zero — reconnect skipped, patching will have no effect",
      );
      return;
    }

    console.log(
      `[WindowAttentionManager] reconnecting signals (old ids: demands=${attentionHandler._windowDemandsAttentionId} urgent=${attentionHandler._windowMarkedUrgentId})`,
    );

    global.display.disconnect(attentionHandler._windowDemandsAttentionId);
    global.display.disconnect(attentionHandler._windowMarkedUrgentId);

    attentionHandler._windowDemandsAttentionId = global.display.connect(
      "window-demands-attention",
      (display, window) =>
        attentionHandler._onWindowDemandsAttention(display, window),
    );
    attentionHandler._windowMarkedUrgentId = global.display.connect(
      "window-marked-urgent",
      (display, window) =>
        attentionHandler._onWindowDemandsAttention(display, window),
    );

    console.log(
      `[WindowAttentionManager] signals reconnected (new ids: demands=${attentionHandler._windowDemandsAttentionId} urgent=${attentionHandler._windowMarkedUrgentId})`,
    );
  }

  dispose() {
    this.disable();
    this.hooks = [];
  }
}
