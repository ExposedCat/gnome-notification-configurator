import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import Meta from "gi://Meta";
import Shell from "gi://Shell";
import St from "gi://St";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import * as Calendar from "resource:///org/gnome/shell/ui/calendar.js";
import * as Layout from "resource:///org/gnome/shell/ui/layout.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageList from "resource:///org/gnome/shell/ui/messageList.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { MonitorManager } from "../utils/monitors.js";
import { type Configuration, SettingsManager } from "../utils/settings.js";
import { applyNotificationTheme, makeColorStyle } from "../utils/themes.js";
import { BannerLifecycle, type BannerMessage } from "./banner-lifecycle.js";
import { getPanelMonitor, resolveNotificationMonitor } from "./monitors.js";
import { createNotificationSlot } from "./notification-layout.js";
import {
  hideBannerAppTitleRow,
  resolveBannerWidgets,
  setNotificationBodyHidden,
} from "./notification-widgets.js";

type BannerConstructor = new (
  notification: MessageTray.Notification,
) => BannerMessage;

type BannerActor = St.Bin & {
  ease: (parameters: {
    translation_y: number;
    duration: number;
    mode: Clutter.AnimationMode;
  }) => void;
};

type Stack = {
  actor: St.Widget;
  container: St.BoxLayout;
  monitor: number;
  origin: [number, number] | null;
  reflowUntil: number;
};

type Banner = {
  notification: MessageTray.Notification;
  actor: BannerActor | null;
  slot: St.Widget | null;
  message: BannerMessage | null;
  stack: Stack | null;
  lifecycle: BannerLifecycle | null;
  entrance: number;
  signals: number[];
  removing: boolean;
  appearance: string;
  background: string;
  headerHidden: boolean;
  timeoutSettings: string;
  position: number | null;
};

type TraySource = MessageTray.Source & {
  disconnectObject: (owner: MessageTray.MessageTray) => void;
  connectObject: (
    bannerSignal: "notification-request-banner",
    bannerHandler: (
      source: MessageTray.Source,
      notification: MessageTray.Notification,
    ) => void,
    removedSignal: "notification-removed",
    removedHandler: (
      source: MessageTray.Source,
      notification: MessageTray.Notification,
    ) => void,
    destroySignal: "destroy",
    destroyHandler: () => void,
    owner: MessageTray.MessageTray,
  ) => void;
};

const SHELL_VERSION = Number.parseInt(Config.PACKAGE_VERSION, 10);
const DEFAULT_CONFIGURATION = SettingsManager.defaultGlobalConfiguration();
const HORIZONTAL_ALIGNMENT: Record<
  Configuration["display"]["notificationPosition"],
  Clutter.ActorAlign
> = {
  fill: Clutter.ActorAlign.FILL,
  left: Clutter.ActorAlign.START,
  center: Clutter.ActorAlign.CENTER,
  right: Clutter.ActorAlign.END,
};
const VERTICAL_ALIGNMENT: Record<
  Configuration["display"]["verticalPosition"],
  Clutter.ActorAlign
> = {
  fill: Clutter.ActorAlign.START,
  top: Clutter.ActorAlign.START,
  center: Clutter.ActorAlign.CENTER,
  bottom: Clutter.ActorAlign.END,
};

export class NotificationStack {
  private injectionManager = new InjectionManager();
  private monitors = new MonitorManager();
  private banners = new Map<MessageTray.Notification, Banner>();
  private originalStyles = new WeakMap<St.Widget, string | null>();
  private queue: Banner[] = [];
  private stacks = new Map<string, Stack>();
  private settingsListener: number;
  private monitorListener: number;
  private shellSignals: Array<{
    actor: { disconnect: (signal: number) => void };
    signal: number;
  }> = [];
  private processing = false;
  private unredirectDisabled = false;
  private panelMonitorIndex = getPanelMonitor()?.index;

  constructor(private settingsManager: SettingsManager) {
    this.patchTray();
    this.reconnectSources();
    this.settingsListener = settingsManager.events.on("stackingChanged", () =>
      this.update(),
    );
    this.monitorListener = this.monitors.events.on("changed", () =>
      this.update(),
    );
    for (const actor of [Main.sessionMode, Main.layoutManager]) {
      const signal = actor.connect(
        actor === Main.sessionMode ? "updated" : "monitors-changed",
        () => this.update(),
      );
      this.shellSignals.push({ actor, signal });
    }
    for (const actor of [Main.overview, Main.xdndHandler]) {
      const prefix = actor === Main.overview ? "window-" : "";
      for (const event of ["begin", "end", ...(prefix ? ["cancelled"] : [])]) {
        const signal = actor.connect(`${prefix}drag-${event}`, () =>
          this.setDragging(event === "begin"),
        );
        this.shellSignals.push({ actor, signal });
      }
      if (prefix) {
        for (const event of ["begin", "end", "cancelled"]) {
          const signal = actor.connect(`item-drag-${event}`, () =>
            this.setDragging(event === "begin"),
          );
          this.shellSignals.push({ actor, signal });
        }
      }
    }
    const panel = Main.layoutManager.panelBox;
    this.shellSignals.push({
      actor: panel,
      signal: panel.connect("notify::allocation", () => {
        const index = getPanelMonitor()?.index;
        if (index === this.panelMonitorIndex) return;
        this.panelMonitorIndex = index;
        this.update();
      }),
    });
    this.update();
  }

  private get tray() {
    return Main.messageTray as unknown as MessageTray.MessageTrayProto;
  }

  private patchTray() {
    const prototype = MessageTray.MessageTray
      .prototype as unknown as MessageTray.MessageTrayProto;
    const manager = this;
    this.injectionManager.overrideMethod(
      prototype,
      "_onNotificationRequestBanner",
      (original) =>
        function (this: MessageTray.MessageTrayProto, source, notification) {
          if (
            manager.settingsManager.stackingEnabled ||
            manager.banners.size > 0
          ) {
            manager.request(notification);
          } else {
            original.call(this, source, notification);
          }
        },
    );
    this.injectionManager.overrideMethod(
      prototype,
      "_onNotificationRemoved",
      (original) =>
        function (this: MessageTray.MessageTrayProto, source, notification) {
          const banner = manager.banners.get(notification);
          if (banner) manager.remove(banner, false);
          original.call(this, source, notification);
        },
    );
    this.injectionManager.overrideMethod(
      prototype,
      "_updateState",
      (original) =>
        function (this: MessageTray.MessageTrayProto) {
          manager.adoptQueue();
          original.call(this);
          manager.update();
        },
    );
    this.injectionManager.overrideMethod(
      prototype,
      "_removeSource",
      (original) =>
        function (this: MessageTray.MessageTrayProto, source) {
          const processing = manager.processing;
          manager.processing = true;
          try {
            for (const banner of [...manager.banners.values()]) {
              if (banner.notification.source === source)
                manager.remove(banner, false, true);
            }
            original.call(this, source);
          } finally {
            manager.processing = processing;
          }
          manager.update();
        },
    );
  }

  private reconnectSources() {
    for (const source of Main.messageTray.getSources()) {
      const trackedSource = source as TraySource;
      trackedSource.disconnectObject(Main.messageTray);
      trackedSource.connectObject(
        "notification-request-banner",
        this.tray._onNotificationRequestBanner.bind(Main.messageTray),
        "notification-removed",
        this.tray._onNotificationRemoved.bind(Main.messageTray),
        "destroy",
        this.tray._removeSource.bind(Main.messageTray, source),
        Main.messageTray,
      );
    }
  }

  private configuration(notification: MessageTray.Notification) {
    const configuration = this.settingsManager.getConfigurationFor(
      notification.source?.title ?? "",
      notification.title,
      notification.body,
    );
    return configuration.enabled
      ? configuration
      : {
          ...DEFAULT_CONFIGURATION,
          enabled: false,
          colors: { ...DEFAULT_CONFIGURATION.colors, enabled: false },
          timeout: {
            ...DEFAULT_CONFIGURATION.timeout,
            enabled: false,
            ignoreIdle: false,
          },
        };
  }

  private request(notification: MessageTray.Notification) {
    if (notification.acknowledged) return;
    const existing = this.banners.get(notification);
    if (existing) {
      notification.acknowledged = existing.actor !== null;
      if (existing.lifecycle) {
        existing.removing = false;
        existing.lifecycle.show();
      }
      return;
    }
    if (
      !notification.source?.policy.enable ||
      notification.urgency === MessageTray.Urgency.LOW ||
      (!notification.source?.policy.showBanners &&
        notification.urgency !== MessageTray.Urgency.CRITICAL)
    )
      return;
    const banner: Banner = {
      notification,
      actor: null,
      slot: null,
      message: null,
      stack: null,
      lifecycle: null,
      entrance: 0,
      signals: [],
      removing: false,
      appearance: "",
      background: "",
      headerHidden: false,
      timeoutSettings: "",
      position: null,
    };
    this.banners.set(notification, banner);
    banner.signals.push(
      notification.connect("destroy", () => this.remove(banner, false)),
      notification.connect("activated", () => this.remove(banner, true)),
      notification.connect("notify::acknowledged", () => {
        if (!banner.actor && notification.acknowledged)
          this.remove(banner, false);
      }),
    );
    this.queue.push(banner);
    this.update();
  }

  private adoptQueue() {
    if (!this.settingsManager.stackingEnabled || this.processing) return;
    const notifications = this.tray._notificationQueue.splice(0);
    this.processing = true;
    try {
      const notification = this.tray._notification;
      if (
        notification &&
        !this.tray._notificationRemoved &&
        (this.tray._notificationState === MessageTray.State.SHOWN ||
          this.tray._notificationState === MessageTray.State.SHOWING)
      ) {
        this.tray._notificationRemoved = true;
        this.tray._hideNotification(false);
        notification.acknowledged = false;
        this.request(notification);
      }
      for (const notification of notifications) this.request(notification);
    } finally {
      this.processing = false;
    }
    if (notifications.length) Main.messageTray.emit("queue-changed");
  }

  private monitor(configuration: Configuration) {
    return resolveNotificationMonitor(
      this.monitors.monitors,
      configuration.display.monitor,
    );
  }

  private stackKey(configuration: Configuration) {
    const monitor = this.monitor(configuration);
    return `${monitor?.index}:${configuration.display.notificationPosition}:${configuration.display.verticalPosition}`;
  }

  private update() {
    if (this.processing) return;
    this.adoptQueue();
    this.processing = true;
    try {
      const allowed =
        Main.sessionMode.hasNotifications &&
        !this.tray._bannerBlocked &&
        !!Main.layoutManager.primaryMonitor;
      for (const stack of this.stacks.values()) stack.actor.visible = allowed;
      for (const banner of [...this.banners.values()]) {
        if (!banner.actor || banner.removing) continue;
        if (!allowed) {
          this.remove(banner, false, true);
          continue;
        }
        const configuration = this.configuration(banner.notification);
        const stack = this.getStack(configuration);
        if (banner.stack !== stack) this.place(banner, stack, configuration);
        this.applyAppearance(banner, configuration);
        const timeoutSettings = this.timeoutSettings(banner, configuration);
        if (banner.timeoutSettings !== timeoutSettings) {
          banner.timeoutSettings = timeoutSettings;
          banner.lifecycle?.refreshTimeout();
        }
        banner.lifecycle?.setPosition(configuration.display.verticalPosition);
        banner.lifecycle?.update();
      }
      if (!allowed || this.tray._notification) return;
      this.queue.sort(
        (first, second) =>
          second.notification.urgency - first.notification.urgency,
      );
      const blocked = new Set<string>();
      for (const banner of [...this.queue]) {
        if (
          !banner.notification.source?.policy.enable ||
          (!banner.notification.source.policy.showBanners &&
            banner.notification.urgency !== MessageTray.Urgency.CRITICAL)
        ) {
          this.remove(banner, false, true);
          continue;
        }
        const configuration = this.configuration(banner.notification);
        const key = this.stackKey(configuration);
        if (blocked.has(key)) continue;
        const monitor = this.monitor(configuration);
        if (
          !monitor ||
          (this.monitors.loading && configuration.display.monitor.connector)
        )
          continue;
        const critical =
          banner.notification.urgency === MessageTray.Urgency.CRITICAL;
        if (
          (this.tray._busy ||
            (!configuration.display.enableFullscreen &&
              monitor.inFullscreen)) &&
          !critical &&
          !banner.notification.forFeedback
        )
          continue;
        const visible = [...this.banners.values()].filter(
          (candidate) =>
            candidate.actor && candidate.stack === this.stacks.get(key),
        );
        if (visible.some((candidate) => candidate.removing)) {
          blocked.add(key);
          continue;
        }
        const maximum = Math.min(
          configuration.stacking.maximumVisible,
          ...visible.map(
            (candidate) =>
              this.configuration(candidate.notification).stacking
                .maximumVisible,
          ),
        );
        if (visible.length >= maximum) {
          blocked.add(key);
          continue;
        }
        this.show(banner, configuration);
      }
    } finally {
      this.processing = false;
    }
  }

  private getStack(configuration: Configuration): Stack {
    const key = this.stackKey(configuration);
    const existing = this.stacks.get(key);
    if (existing) return existing;
    const actor = new St.Widget({
      layout_manager: new Clutter.BinLayout(),
      reactive: false,
      clip_to_allocation: true,
    });
    const constraint = new Layout.MonitorConstraint({
      index: this.monitor(configuration)?.index ?? -1,
      workArea: true,
    });
    actor.add_constraint(constraint);
    const container = new St.BoxLayout({
      ...(SHELL_VERSION >= 48
        ? { orientation: Clutter.Orientation.VERTICAL }
        : { vertical: true }),
      x_expand: true,
      y_expand: true,
      x_align: HORIZONTAL_ALIGNMENT[configuration.display.notificationPosition],
      y_align: VERTICAL_ALIGNMENT[configuration.display.verticalPosition],
      style: "spacing: 0;",
      reactive: false,
    });
    actor.add_child(container);
    Main.layoutManager.addChrome(
      actor,
      SHELL_VERSION < 50 ? { affectsInputRegion: false } : {},
    );
    const stack: Stack = {
      actor,
      container,
      monitor: this.monitor(configuration)?.index ?? 0,
      origin: null,
      reflowUntil: 0,
    };
    this.stacks.set(key, stack);
    actor.connect("notify::allocation", () => {
      const allocation = actor.get_allocation_box();
      if (
        stack.origin &&
        (stack.origin[0] !== allocation.x1 || stack.origin[1] !== allocation.y1)
      ) {
        for (const banner of this.banners.values()) {
          if (banner.stack === stack) banner.slot?.queue_relayout();
        }
      }
      stack.origin = [allocation.x1, allocation.y1];
      this.animateReflow(stack);
    });
    container.connect("notify::allocation", () => this.animateReflow(stack));
    return stack;
  }

  private animateReflow(stack: Stack) {
    for (const banner of this.banners.values()) {
      const actor = banner.actor;
      if (!actor || banner.stack !== stack || !banner.slot?.get_parent())
        continue;
      this.clipBanner(banner);
      const position =
        banner.slot.get_transformed_position()[1] +
        actor.get_theme_node().get_margin(St.Side.TOP);
      if (!Number.isFinite(position)) continue;
      const previous = banner.position;
      banner.position = position;
      if (previous === null || Math.abs(previous - position) < 1) continue;
      actor.translation_y += previous - position;
      actor.ease({
        translation_y: 0,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      });
    }
  }

  private clipBanner(banner: Banner) {
    const { actor, stack, slot } = banner;
    if (!actor?.get_parent() || !stack || !slot?.get_parent()) return;
    const area = Main.layoutManager.getWorkAreaForMonitor(stack.monitor);
    const [slotHorizontal, slotVertical] = slot.get_transformed_position();
    const node = actor.get_theme_node();
    const horizontal =
      slotHorizontal + node.get_margin(St.Side.LEFT) + actor.translation_x;
    const vertical =
      slotVertical + node.get_margin(St.Side.TOP) + actor.translation_y;
    const alignment = banner.lifecycle?.actor.y_align;
    const top = Math.max(
      area.y - vertical,
      alignment === Clutter.ActorAlign.START ||
        alignment === Clutter.ActorAlign.FILL
        ? 0
        : -area.height,
    );
    actor.set_clip(
      area.x - horizontal,
      top,
      area.width,
      Math.max(0, area.y + area.height - vertical - top),
    );
  }

  private place(banner: Banner, stack: Stack, configuration: Configuration) {
    if (!banner.slot) return;
    const previous = banner.stack;
    banner.position = null;
    banner.slot.get_parent()?.remove_child(banner.slot);
    if (
      stack.container.get_n_children() &&
      (configuration.stacking.direction === "up" ||
        configuration.display.verticalPosition === "bottom" ||
        configuration.display.verticalPosition === "center")
    ) {
      stack.reflowUntil = GLib.get_monotonic_time() + 200000;
    }
    stack.container.insert_child_at_index(
      banner.slot,
      configuration.stacking.direction === "up" ? 0 : -1,
    );
    banner.stack = stack;
    if (previous && previous !== stack) this.releaseStack(previous);
  }

  private show(banner: Banner, configuration: Configuration) {
    const message = this.createMessage(banner);
    const lifecycle = new BannerLifecycle(
      this.settingsManager,
      banner.notification,
      message,
      () => this.remove(banner, false),
      () => {
        banner.removing = true;
      },
    );
    const actor = new St.Bin({
      child: lifecycle.actor,
      reactive: false,
    }) as BannerActor;
    banner.actor = actor;
    banner.slot = createNotificationSlot(actor);
    banner.message = message;
    banner.lifecycle = lifecycle;
    lifecycle.setPosition(configuration.display.verticalPosition);
    banner.timeoutSettings = this.timeoutSettings(banner, configuration);
    actor.connect("notify::allocation", () => {
      if (banner.stack) this.animateReflow(banner.stack);
    });
    actor.connect("notify::translation-y", () => this.clipBanner(banner));
    this.queue = this.queue.filter((queued) => queued !== banner);
    this.place(banner, this.getStack(configuration), configuration);
    this.applyAppearance(banner, configuration);
    Main.layoutManager.addChrome(
      actor,
      SHELL_VERSION < 50 ? { affectsInputRegion: true } : {},
    );
    this.setUnredirect(true);
    const delay = Math.max(
      0,
      ((banner.stack?.reflowUntil ?? 0) - GLib.get_monotonic_time()) / 1000,
    );
    if (delay > 0) {
      banner.entrance = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        Math.ceil(delay),
        () => {
          banner.entrance = 0;
          lifecycle.show();
          return GLib.SOURCE_REMOVE;
        },
      );
    } else lifecycle.show();
  }

  private createMessage(banner: Banner) {
    const namespace = (SHELL_VERSION >= 48
      ? MessageList
      : Calendar) as unknown as { NotificationMessage: BannerConstructor };
    const message = new namespace.NotificationMessage(banner.notification);
    message.can_focus = false;
    message.add_style_class_name("notification-banner");
    message._header.expandButton.hide();
    message.connect_after("close", () => this.remove(banner, true));
    return message;
  }

  private applyAppearance(banner: Banner, configuration: Configuration) {
    if (!banner.actor || !banner.message) return;
    setNotificationBodyHidden(
      resolveBannerWidgets(banner.message),
      configuration.enabled && configuration.content.hideBody,
    );
    const hidden =
      configuration.enabled &&
      this.settingsManager.shouldHideAppTitleRowFor(
        banner.notification.source?.title ?? "",
        banner.notification.title ?? "",
        banner.notification.body ?? "",
      );
    const appearance = JSON.stringify([
      configuration.enabled,
      configuration.colors,
      configuration.margins,
      hidden,
    ]);
    if (banner.appearance === appearance) return;
    banner.appearance = appearance;
    if (banner.headerHidden && !hidden) {
      const expanded = banner.message.expanded;
      banner.message = this.createMessage(banner);
      banner.lifecycle?.replaceMessage(banner.message);
      banner.background = "";
      Main.layoutManager.removeChrome(banner.actor);
      Main.layoutManager.addChrome(
        banner.actor,
        SHELL_VERSION < 50 ? { affectsInputRegion: true } : {},
      );
      if (expanded) banner.message.expand(false);
      banner.headerHidden = false;
      setNotificationBodyHidden(
        resolveBannerWidgets(banner.message),
        configuration.enabled && configuration.content.hideBody,
      );
    }
    const widgets = resolveBannerWidgets(banner.message);
    for (const widget of [
      banner.actor,
      widgets.container,
      widgets.source,
      widgets.time,
      widgets.title,
      widgets.body,
    ]) {
      if (!widget) continue;
      if (!this.originalStyles.has(widget)) {
        this.originalStyles.set(widget, widget.get_style());
      } else {
        const original = this.originalStyles.get(widget) ?? null;
        if (widget.get_style() !== original) widget.set_style(original);
      }
    }
    const margins = configuration.margins;
    if (configuration.enabled && margins.enabled) {
      const original = this.originalStyles.get(banner.actor);
      const style = `margin-top: ${margins.top}px; margin-bottom: ${margins.bottom}px; margin-left: ${margins.left}px; margin-right: ${margins.right}px;`;
      banner.actor.set_style(
        original ? `${original.replace(/;\s*$/, "")}; ${style}` : style,
      );
    }
    banner.background = "";
    if (configuration.colors.enabled) {
      applyNotificationTheme(widgets, configuration.colors.theme);
      banner.background = makeColorStyle(
        configuration.colors.theme.backgroundColor,
        "background",
      );
    }
    if (hidden && !banner.headerHidden)
      banner.headerHidden = hideBannerAppTitleRow(banner.lifecycle?.actor);
    banner.slot?.queue_relayout();
  }

  private timeoutSettings(banner: Banner, configuration: Configuration) {
    return JSON.stringify([configuration.timeout, banner.notification.urgency]);
  }

  private remove(banner: Banner, animate: boolean, preserve = false) {
    if (!this.banners.has(banner.notification)) return;
    if (banner.removing && animate) return;
    if (animate && banner.lifecycle && !banner.entrance) {
      banner.lifecycle.hide(true);
      return;
    }
    this.banners.delete(banner.notification);
    this.queue = this.queue.filter((queued) => queued !== banner);
    if (banner.stack && banner.stack.container.get_n_children() > 1) {
      banner.stack.reflowUntil = GLib.get_monotonic_time() + 200000;
    }
    this.destroyBanner(banner);
    if (banner.stack) this.releaseStack(banner.stack);
    if (
      !preserve &&
      banner.actor &&
      banner.notification.isTransient &&
      banner.notification.source?.notifications.includes(banner.notification)
    ) {
      banner.notification.destroy(
        MessageTray.NotificationDestroyedReason.EXPIRED,
      );
    }
    this.update();
    if (![...this.banners.values()].some((remaining) => remaining.actor))
      this.setUnredirect(false);
  }

  private destroyBanner(banner: Banner) {
    if (banner.entrance) GLib.source_remove(banner.entrance);
    banner.entrance = 0;
    for (const signal of banner.signals) banner.notification.disconnect(signal);
    banner.signals = [];
    banner.lifecycle?.dispose();
    banner.slot?.destroy();
    if (banner.actor) Main.layoutManager.removeChrome(banner.actor);
    banner.actor?.destroy();
  }

  private releaseStack(stack: Stack) {
    if (stack.container.get_n_children()) return;
    for (const [key, candidate] of this.stacks) {
      if (candidate !== stack) continue;
      this.stacks.delete(key);
      Main.layoutManager.removeChrome(stack.actor);
      stack.actor.destroy();
      break;
    }
  }

  private setDragging(dragging: boolean) {
    for (const banner of this.banners.values()) {
      if (banner.actor) Shell.util_set_hidden_from_pick(banner.actor, dragging);
    }
  }

  private setUnredirect(disabled: boolean) {
    if (this.unredirectDisabled === disabled) return;
    this.unredirectDisabled = disabled;
    if (SHELL_VERSION >= 48) {
      const compositor = (
        global as unknown as {
          compositor: {
            disable_unredirect: () => void;
            enable_unredirect: () => void;
          };
        }
      ).compositor;
      if (disabled) compositor.disable_unredirect();
      else compositor.enable_unredirect();
    } else if (disabled) Meta.disable_unredirect_for_display(global.display);
    else Meta.enable_unredirect_for_display(global.display);
  }

  dispose() {
    this.settingsManager.events.off(this.settingsListener);
    this.monitors.events.off(this.monitorListener);
    this.monitors.dispose();
    for (const { actor, signal } of this.shellSignals) actor.disconnect(signal);
    this.shellSignals = [];
    this.injectionManager.clear();
    this.reconnectSources();
    const pending = this.queue.map((banner) => banner.notification);
    const banners = [...this.banners.values()];
    this.banners.clear();
    this.queue = [];
    for (const banner of banners) this.destroyBanner(banner);
    for (const stack of this.stacks.values()) {
      Main.layoutManager.removeChrome(stack.actor);
      stack.actor.destroy();
    }
    this.stacks.clear();
    this.setUnredirect(false);
    this.tray._notificationQueue.push(
      ...pending.filter((notification) => !notification.acknowledged),
    );
    Main.messageTray.emit("queue-changed");
    this.tray._updateState();
  }
}
