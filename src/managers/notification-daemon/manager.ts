import type Shell from "gi://Shell";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type {
  FdoNotificationDaemonNotifyParams,
  FdoNotificationDaemonProto,
  FdoNotificationDaemonSource,
} from "resource:///org/gnome/shell/ui/notificationDaemon.js";

export type FdoNotificationContext = {
  appName: string;
  title: string;
  body: string;
};

type NotificationDaemonHookContext = {
  daemon: FdoNotificationDaemonProto;
  notification: FdoNotificationContext | null;
};

export type GetSourceForAppHook = (
  original: (
    sender: string | null | undefined,
    app: Shell.App,
  ) => FdoNotificationDaemonSource,
  sender: string | null | undefined,
  app: Shell.App,
  context: NotificationDaemonHookContext,
) => FdoNotificationDaemonSource | null;

export type GetSourceForPidAndNameHook = (
  original: (
    sender: string | null | undefined,
    pid: number | null | undefined,
    appName: string | null | undefined,
  ) => FdoNotificationDaemonSource,
  sender: string | null | undefined,
  pid: number | null | undefined,
  appName: string | null | undefined,
  context: NotificationDaemonHookContext,
) => FdoNotificationDaemonSource | null;

export class NotificationDaemonManager {
  private injectionManager = new InjectionManager();
  private getSourceForAppHooks: GetSourceForAppHook[] = [];
  private getSourceForPidAndNameHooks: GetSourceForPidAndNameHook[] = [];
  private currentNotification: FdoNotificationContext | null = null;

  registerGetSourceForAppHook(hook: GetSourceForAppHook) {
    this.getSourceForAppHooks.push(hook);
  }

  registerGetSourceForPidAndNameHook(hook: GetSourceForPidAndNameHook) {
    this.getSourceForPidAndNameHooks.push(hook);
  }

  enable() {
    this.patchNotifyAsync();
    this.patchGetSourceForApp();
    this.patchGetSourceForPidAndName();
  }

  disable() {
    this.injectionManager.clear();
  }

  private getFdoNotificationDaemonProto(): FdoNotificationDaemonProto {
    const fdoNotificationDaemon =
      Main.notificationDaemon._fdoNotificationDaemon;
    return Object.getPrototypeOf(
      fdoNotificationDaemon,
    ) as FdoNotificationDaemonProto;
  }

  private patchNotifyAsync() {
    const proto = this.getFdoNotificationDaemonProto();
    const manager = this;

    this.injectionManager.overrideMethod(
      proto,
      "NotifyAsync",
      (original) =>
        function (
          this: FdoNotificationDaemonProto,
          params: FdoNotificationDaemonNotifyParams,
          invocation: unknown,
        ) {
          const [appName, _replacesId, _appIcon, title, body] = params;
          manager.currentNotification = {
            appName,
            title,
            body,
          };

          try {
            return original.call(this, params, invocation);
          } finally {
            manager.currentNotification = null;
          }
        },
    );
  }

  private patchGetSourceForApp() {
    const proto = this.getFdoNotificationDaemonProto();
    const hooks = this.getSourceForAppHooks;
    const manager = this;

    this.injectionManager.overrideMethod(
      proto,
      "_getSourceForApp",
      (original) =>
        function (
          this: FdoNotificationDaemonProto,
          sender: string | null | undefined,
          app: Shell.App,
        ) {
          for (const hook of hooks) {
            const source = hook(
              (currentSender, currentApp) =>
                original.call(this, currentSender, currentApp),
              sender,
              app,
              {
                daemon: this,
                notification: manager.currentNotification,
              },
            );
            if (source) {
              return source;
            }
          }

          return original.call(this, sender, app);
        },
    );
  }

  private patchGetSourceForPidAndName() {
    const proto = this.getFdoNotificationDaemonProto();
    const hooks = this.getSourceForPidAndNameHooks;
    const manager = this;

    this.injectionManager.overrideMethod(
      proto,
      "_getSourceForPidAndName",
      (original) =>
        function (
          this: FdoNotificationDaemonProto,
          sender: string | null | undefined,
          pid: number | null | undefined,
          appName: string | null | undefined,
        ) {
          for (const hook of hooks) {
            const source = hook(
              (currentSender, currentPid, currentAppName) =>
                original.call(this, currentSender, currentPid, currentAppName),
              sender,
              pid,
              appName,
              {
                daemon: this,
                notification: manager.currentNotification,
              },
            );
            if (source) {
              return source;
            }
          }

          return original.call(this, sender, pid, appName);
        },
    );
  }

  dispose() {
    this.disable();
    this.currentNotification = null;
    this.getSourceForAppHooks = [];
    this.getSourceForPidAndNameHooks = [];
  }
}
