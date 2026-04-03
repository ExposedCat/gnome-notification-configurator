import type Meta from "gi://Meta";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export type WindowAttentionHook = (
  original: () => void,
  window: Meta.Window,
) => boolean;

type WindowAttentionHandlerProto = {
  _onWindowDemandsAttention: (
    display: Meta.Display,
    window: Meta.Window,
  ) => void;
  _windowDemandsAttentionId?: number;
  _windowMarkedUrgentId?: number;
};

type DisplaySignalApi = Meta.Display & {
  connectObject?: (...args: unknown[]) => void;
  disconnectObject?: (object: unknown) => void;
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
    this.injectionManager.clear();
  }

  private patchHandler() {
    const proto = Object.getPrototypeOf(
      Main.windowAttentionHandler,
    ) as unknown as WindowAttentionHandlerProto;

    const hooks = this.hooks;

    this.injectionManager.overrideMethod(
      proto,
      "_onWindowDemandsAttention",
      (original) =>
        function (
          this: WindowAttentionHandlerProto,
          display: Meta.Display,
          window: Meta.Window,
        ) {
          let originalCalled = false;
          const runOriginal = () => {
            if (originalCalled) {
              return;
            }
            originalCalled = true;
            original.call(this, display, window);
          };

          for (const hook of hooks) {
            let handled = false;
            try {
              handled = hook(runOriginal, window);
            } catch (error) {
              console.error("[WindowAttentionManager] hook failed", error);
            }

            if (handled || originalCalled) {
              return;
            }
          }

          runOriginal();
        },
    );
  }

  private reconnectSignals() {
    const attentionHandler =
      Main.windowAttentionHandler as unknown as WindowAttentionHandlerProto;
    const display = global.display as DisplaySignalApi;
    const callback = (currentDisplay: Meta.Display, window: Meta.Window) =>
      attentionHandler._onWindowDemandsAttention(currentDisplay, window);

    if (
      typeof display.connectObject === "function" &&
      typeof display.disconnectObject === "function"
    ) {
      display.disconnectObject(attentionHandler);
      display.connectObject(
        "window-demands-attention",
        callback,
        "window-marked-urgent",
        callback,
        attentionHandler,
      );
      return;
    }

    if (typeof attentionHandler._windowDemandsAttentionId === "number") {
      display.disconnect(attentionHandler._windowDemandsAttentionId);
    }
    if (typeof attentionHandler._windowMarkedUrgentId === "number") {
      display.disconnect(attentionHandler._windowMarkedUrgentId);
    }

    attentionHandler._windowDemandsAttentionId = display.connect(
      "window-demands-attention",
      callback,
    );
    attentionHandler._windowMarkedUrgentId = display.connect(
      "window-marked-urgent",
      callback,
    );
  }

  dispose() {
    this.disable();
    this.hooks = [];
  }
}
