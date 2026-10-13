import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager, VerticalPosition } from "../utils/settings.js";

export type BannerMessage = St.Button & {
  expanded: boolean;
  expand: (animate: boolean) => void;
  _header: { expandButton: St.Button };
};

type FocusGrabber = {
  grabFocus: () => void;
  ungrabFocus: () => void;
};

type Lifecycle = St.Widget &
  MessageTray.MessageTrayProto & {
    ease: (parameters: Record<string, unknown>) => void;
    idleMonitor: typeof Main.messageTray.idleMonitor;
    _notificationTimeoutId: number;
    _notificationLeftTimeoutId: number;
    _notificationExpired: boolean;
    _pointerInNotification: boolean;
    _notificationHovered: boolean;
    _useLongerNotificationLeftTimeout: boolean;
    _showNotificationMouseX: number;
    _showNotificationMouseY: number;
    _lastSeenMouseX: number;
    _lastSeenMouseY: number;
    _notificationLeftMouseX: number;
    _notificationLeftMouseY: number;
    _notificationFocusGrabber: FocusGrabber;
    _notificationTimeout: () => void;
    _onNotificationHoverChanged: () => void;
    _onNotificationLeftTimeout: () => void;
    _onIdleMonitorBecameActive: () => void;
    _onNotificationKeyRelease: (
      actor: St.Widget,
      event: Clutter.Event,
    ) => boolean;
    _expireNotification: () => void;
    _expandBanner: (automatic: boolean) => void;
    _ensureBannerFocused: () => void;
  };

const NATIVE_LIFECYCLE = MessageTray.MessageTray
  .prototype as unknown as Lifecycle;
const UPDATE_STATE = NATIVE_LIFECYCLE._updateState;
const ALIGNMENT: Record<VerticalPosition, Clutter.ActorAlign> = {
  fill: Clutter.ActorAlign.FILL,
  top: Clutter.ActorAlign.START,
  center: Clutter.ActorAlign.CENTER,
  bottom: Clutter.ActorAlign.END,
};

export class BannerLifecycle {
  readonly actor: Lifecycle;
  private idleWatch = 0;
  private disposed = false;
  private started = false;

  constructor(
    private settingsManager: SettingsManager,
    notification: MessageTray.Notification,
    message: BannerMessage,
    private hidden: () => void,
    private hiding: () => void,
  ) {
    const actor = new St.Widget({
      layout_manager: new Clutter.BinLayout(),
      reactive: true,
      track_hover: true,
      x_expand: true,
      opacity: 0,
    }) as Lifecycle;
    this.actor = actor;
    actor.add_child(message);
    actor._bannerBin = actor;
    actor._banner = message as unknown as NonNullable<Lifecycle["_banner"]>;
    actor._notification = notification;
    actor._notificationQueue = [];
    actor._notificationState = MessageTray.State.HIDDEN;
    actor._notificationTimeoutId = 0;
    actor._notificationLeftTimeoutId = 0;
    actor._notificationRemoved = false;
    actor._notificationExpired = false;
    actor._pointerInNotification = false;
    actor._notificationHovered = false;
    actor._useLongerNotificationLeftTimeout = false;
    actor._updatingState = false;
    actor.idleMonitor = Main.messageTray.idleMonitor;
    const focusGrabber = Object.getPrototypeOf(
      (Main.messageTray as unknown as Lifecycle)._notificationFocusGrabber,
    ).constructor as new (
      actor: St.Widget,
    ) => FocusGrabber;
    actor._notificationFocusGrabber = new focusGrabber(actor);

    actor._updateState = () => this.update();
    actor._showNotification = () => {};
    actor._hideNotificationCompleted = () => {
      actor._notificationState = MessageTray.State.HIDDEN;
      this.hidden();
    };
    actor._hideNotification = (animate) => {
      this.hiding();
      actor._updateNotificationTimeout(0);
      NATIVE_LIFECYCLE._hideNotification.call(actor, animate);
    };
    actor._updateShowingNotification = () =>
      NATIVE_LIFECYCLE._updateShowingNotification.call(actor);
    actor._showNotificationCompleted = () =>
      NATIVE_LIFECYCLE._showNotificationCompleted.call(actor);
    actor._updateNotificationTimeout = (timeout) =>
      NATIVE_LIFECYCLE._updateNotificationTimeout.call(actor, timeout);
    actor._resetNotificationLeftTimeout = () =>
      NATIVE_LIFECYCLE._resetNotificationLeftTimeout.call(actor);
    actor._notificationTimeout = () =>
      NATIVE_LIFECYCLE._notificationTimeout.call(actor);
    actor._onNotificationHoverChanged = () =>
      NATIVE_LIFECYCLE._onNotificationHoverChanged.call(actor);
    actor._onNotificationLeftTimeout = () =>
      NATIVE_LIFECYCLE._onNotificationLeftTimeout.call(actor);
    actor._onIdleMonitorBecameActive = () => {
      this.idleWatch = 0;
      NATIVE_LIFECYCLE._onIdleMonitorBecameActive.call(actor);
    };
    actor._expireNotification = () =>
      NATIVE_LIFECYCLE._expireNotification.call(actor);
    actor._expandBanner = (automatic) =>
      NATIVE_LIFECYCLE._expandBanner.call(actor, automatic);
    actor._ensureBannerFocused = () =>
      NATIVE_LIFECYCLE._ensureBannerFocused.call(actor);
    actor.connect("notify::hover", () => actor._onNotificationHoverChanged());
    actor.connect(
      "key-release-event",
      (_actor: St.Widget, event: Clutter.Event) =>
        NATIVE_LIFECYCLE._onNotificationKeyRelease.call(actor, actor, event),
    );
  }

  show() {
    if (this.disposed) return;
    const actor = this.actor;
    const notification = actor._notification;
    if (!notification) return;
    if (!this.started) {
      this.started = true;
      actor._userActiveWhileNotificationShown =
        actor.idleMonitor.get_idletime() <= 1000;
      if (!actor._userActiveWhileNotificationShown) {
        this.idleWatch = actor.idleMonitor.add_user_active_watch(
          actor._onIdleMonitorBecameActive,
        );
      }
      const [pointerX, pointerY] = global.get_pointer();
      actor._showNotificationMouseX = pointerX;
      actor._showNotificationMouseY = pointerY;
      actor._lastSeenMouseX = pointerX;
      actor._lastSeenMouseY = pointerY;
      actor._resetNotificationLeftTimeout();
      actor.y =
        actor.y_align === Clutter.ActorAlign.START ||
        actor.y_align === Clutter.ActorAlign.FILL
          ? -actor.get_preferred_height(-1)[1]
          : 0;
    }
    actor.show();
    actor._updateShowingNotification();
  }

  setPosition(position: VerticalPosition) {
    this.actor.y_align = ALIGNMENT[position];
  }

  update() {
    if (this.disposed || !this.started) return;
    const actor = this.actor;
    const tray = Main.messageTray as unknown as Lifecycle;
    if (tray._busy && !actor._busy) actor._updateNotificationTimeout(0);
    actor._busy = tray._busy;
    actor._bannerBlocked = tray._bannerBlocked;
    const notification = actor._notification;
    if (notification) {
      const configuration = this.settingsManager.getConfigurationFor(
        notification.source?.title ?? "",
        notification.title,
        notification.body,
      );
      if (
        configuration.enabled &&
        configuration.timeout.enabled &&
        configuration.timeout.ignoreIdle
      ) {
        actor._userActiveWhileNotificationShown = true;
      }
    }
    UPDATE_STATE.call(actor);
  }

  hide(animate: boolean) {
    if (this.disposed) return;
    this.actor._hideNotification(animate);
  }

  refreshTimeout() {
    if (
      !this.disposed &&
      this.actor._notificationState === MessageTray.State.SHOWN
    ) {
      this.actor._showNotificationCompleted();
      this.update();
    }
  }

  replaceMessage(message: BannerMessage) {
    const previous = this.actor.get_first_child();
    if (previous) this.actor.remove_child(previous);
    this.actor.add_child(message);
    this.actor._banner = message as unknown as NonNullable<
      Lifecycle["_banner"]
    >;
    previous?.destroy();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.actor._updateNotificationTimeout(0);
    this.actor._resetNotificationLeftTimeout();
    this.actor._notificationFocusGrabber.ungrabFocus();
    if (this.idleWatch) this.actor.idleMonitor.remove_watch(this.idleWatch);
    this.idleWatch = 0;
    this.actor.remove_all_transitions();
  }
}
