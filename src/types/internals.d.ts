import type Gio from "gi://Gio";
import type Meta from "gi://Meta";
import type Shell from "gi://Shell";
import type St from "gi://St";
import {
  type Notification,
  Source,
} from "resource:///org/gnome/shell/ui/messageTray.js";
import type { FdoNotificationDaemonProto as RuntimeFdoNotificationDaemonProto } from "resource:///org/gnome/shell/ui/notificationDaemon.js";
import type { NotificationDaemon as ShellNotificationDaemon } from "@girs/gnome-shell/ui/notificationDaemon";
import type { Panel } from "@girs/gnome-shell/ui/panel";
import type { PopupMenu } from "@girs/gnome-shell/ui/popupMenu";

declare module "resource:///org/gnome/shell/extensions/extension.js" {
  export * from "@girs/gnome-shell/extensions/extension";

  type CreateOverrideFunc<T> = (originalMethod: T) => T;

  export class InjectionManager {
    overrideMethod<P extends object, K extends string & keyof P>(
      prototype: P,
      methodName: K,
      createOverrideFunc: CreateOverrideFunc<P[K]>,
    ): void;
    restoreMethod<P extends object>(
      prototype: P,
      methodName: string & keyof P,
    ): void;
    clear(): void;
  }
}

declare module "resource:///org/gnome/shell/ui/main.js" {
  export * from "@girs/gnome-shell/ui/main";

  type NotificationDaemon = ShellNotificationDaemon & {
    _fdoNotificationDaemon: RuntimeFdoNotificationDaemonProto;
  };

  type WindowAttentionHandler = {
    _onWindowDemandsAttention: (
      display: Meta.Display,
      window: Meta.Window,
    ) => void;
    _windowDemandsAttentionId?: number;
    _windowMarkedUrgentId?: number;
  };

  export type MessagesIndicator = St.Icon & {
    _sources: Source[];
    _settings: Gio.Settings;
    _sync: () => void;
  };

  type DateMenuButton = Omit<Panel["statusArea"]["dateMenu"], "menu"> & {
    menu: PopupMenu<{ "open-state-changed": [boolean] }>;
    _indicator: MessagesIndicator;
    _clockDisplay: St.Label;
  };

  export const notificationDaemon: NotificationDaemon;
  export const windowAttentionHandler: WindowAttentionHandler;
  export const panel: Omit<Panel, "statusArea"> & {
    statusArea: Omit<Panel["statusArea"], "dateMenu"> & {
      dateMenu: DateMenuButton;
    };
  };
}

declare module "resource:///org/gnome/shell/ui/notificationDaemon.js" {
  export * from "@girs/gnome-shell/ui/notificationDaemon";

  export type FdoNotificationDaemonNotifyParams = [
    appName: string,
    replacesId: number,
    appIcon: string,
    summary: string,
    body: string,
    actions: string[],
    hints: Record<string, unknown>,
    timeout: number,
  ];

  export type FdoNotificationDaemonProto = {
    NotifyAsync: (
      params: FdoNotificationDaemonNotifyParams,
      invocation: unknown,
    ) => unknown;
    _getSourceForApp: (
      sender: string | null | undefined,
      app: Shell.App,
    ) => FdoNotificationDaemonSource;
    _getSourceForPidAndName: (
      sender: string | null | undefined,
      pid: number | null | undefined,
      appName: string | null | undefined,
    ) => FdoNotificationDaemonSource;
  };

  export class FdoNotificationDaemonSource extends Source {
    constructor(sender: string | null | undefined, app: Shell.App | null);
    processNotification(
      notification: Notification,
      appName: string,
      appIcon: string,
    ): void;
  }

  export class GtkNotificationDaemonAppSource {
    addNotification(notification: Notification): void;
  }
}

declare module "resource:///org/gnome/shell/ui/messageTray.js" {
  export * from "@girs/gnome-shell/ui/messageTray";
  import type {
    Notification,
    Source,
    Urgency,
  } from "@girs/gnome-shell/ui/messageTray";

  export type MessageTrayProto = {
    _onNotificationRequestBanner: (
      source: Source,
      notification: Notification,
    ) => void;
    _onNotificationRemoved: (
      source: Source,
      notification: Notification,
    ) => void;
    _removeSource: (source: Source) => void;
    _bannerBlocked: boolean;
    _busy: boolean;
    _notificationRemoved: boolean;
    _notificationQueue: Notification[];
    _notification: Notification | null;
    _updatingState: boolean;
    _updateNotificationTimeout: (timeout: number) => void;
    _updateState: () => void;
    _showNotification: () => void;
    _updateShowingNotification: () => void;
    _hideNotification: (animate: boolean) => void;
    _showNotificationCompleted: () => void;
    _hideNotificationCompleted: () => void;
    _resetNotificationLeftTimeout: () => void;
    _notificationFocusGrabber: { ungrabFocus: () => void };
    _userActiveWhileNotificationShown?: boolean;
    _banner:
      | import("@girs/gnome-shell/ui/messageList").NotificationMessage
      | null;
    _bannerBin: import("gi://St").default.Widget & {
      ease: (params: Record<string, unknown>) => void;
    };
    _notificationState: number;
  };

  export type NotificationProto = {
    setUrgency: (urgency: Urgency) => void;
  };

  export type SourceProto = Source & {
    notifications: Notification[];
    _onNotificationDestroy: (notification: Notification) => void;
  };
}
