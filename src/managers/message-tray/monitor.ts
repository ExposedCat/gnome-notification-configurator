import * as Layout from "resource:///org/gnome/shell/ui/layout.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import {
  getPanelMonitor,
  resolveNotificationMonitor,
} from "../../shell/monitors.js";
import { MonitorManager } from "../../utils/monitors.js";
import type { SettingsManager } from "../../utils/settings.js";
import type { MessageTrayManager } from "./manager.js";

export type NotificationMonitor = typeof Main.layoutManager.primaryMonitor;

export class MonitorAdapter {
  private monitors = new MonitorManager();
  private constraint = Main.messageTray
    .get_constraints()
    .find((constraint) => constraint instanceof Layout.MonitorConstraint);
  private originalPrimary = this.constraint?.primary;
  private originalIndex = this.constraint?.index;
  private monitorListener?: number;
  private settingsListeners: number[] = [];
  private layoutSignal?: number;
  private fullscreenSignal?: number;
  private panelSignal?: number;
  private panelMonitorIndex = getPanelMonitor()?.index;

  constructor(private settingsManager: SettingsManager) {}

  private get tray() {
    return Main.messageTray as unknown as MessageTray.MessageTrayProto;
  }

  private get selection() {
    const notification =
      this.tray._notificationState === MessageTray.State.HIDDEN
        ? this.tray._notificationQueue.find(
            (notification) => !notification.acknowledged,
          )
        : this.tray._notification;
    return notification
      ? this.settingsManager.getMonitorFor(
          notification.source?.title ?? "",
          notification.title ?? "",
          notification.body ?? "",
        )
      : this.settingsManager.monitor;
  }

  getMonitor(): NotificationMonitor {
    return resolveNotificationMonitor(this.monitors.monitors, this.selection);
  }

  private updateConstraint() {
    if (!this.constraint) return;

    const monitor = this.getMonitor();
    if (!monitor || monitor.index === Main.layoutManager.primaryIndex) {
      if (!this.constraint.primary) this.constraint.primary = true;
    } else if (
      this.constraint.primary ||
      this.constraint.index !== monitor.index
    ) {
      this.constraint.index = monitor.index;
    }
  }

  prepareNotification(): boolean {
    if (this.constraint && this.monitors.loading && this.selection.connector) {
      return false;
    }
    this.updateConstraint();
    const notification = this.tray._notificationQueue.find(
      (notification) => !notification.acknowledged,
    );
    return (
      !notification ||
      this.settingsManager.fullscreenEnabled ||
      !this.getMonitor()?.inFullscreen ||
      notification.forFeedback ||
      notification.urgency === MessageTray.Urgency.CRITICAL
    );
  }

  register(manager: MessageTrayManager) {
    manager.registerUpdateStateHook(() => {
      if (!this.tray._updatingState) this.updateConstraint();
    });
    const update = () => {
      this.updateConstraint();
      this.tray._updateState();
    };
    this.monitorListener = this.monitors.events.on("changed", update);
    this.settingsListeners.push(
      this.settingsManager.events.on("monitorChanged", update),
      this.settingsManager.events.on("fullscreenEnabledChanged", update),
    );
    this.layoutSignal = Main.layoutManager.connect("monitors-changed", () => {
      this.monitors.refresh();
      update();
    });
    this.fullscreenSignal = global.display.connect(
      "in-fullscreen-changed",
      update,
    );
    this.panelSignal = Main.layoutManager.panelBox.connect(
      "notify::allocation",
      () => {
        const index = getPanelMonitor()?.index;
        if (index === this.panelMonitorIndex) return;
        this.panelMonitorIndex = index;
        update();
      },
    );
    this.updateConstraint();
  }

  dispose() {
    if (this.layoutSignal !== undefined) {
      Main.layoutManager.disconnect(this.layoutSignal);
    }
    if (this.fullscreenSignal !== undefined) {
      global.display.disconnect(this.fullscreenSignal);
    }
    if (this.panelSignal !== undefined) {
      Main.layoutManager.panelBox.disconnect(this.panelSignal);
    }
    if (this.monitorListener !== undefined) {
      this.monitors.events.off(this.monitorListener);
    }
    for (const listener of this.settingsListeners) {
      this.settingsManager.events.off(listener);
    }
    this.monitors.dispose();
    if (this.constraint && this.originalIndex !== undefined) {
      this.constraint.index = this.originalIndex;
      if (this.originalPrimary) this.constraint.primary = true;
    }
  }
}
