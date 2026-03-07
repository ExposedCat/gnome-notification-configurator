import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { FullscreenAdapter } from "../managers/message-tray/fullscreen.js";
import { IdleAdapter } from "../managers/message-tray/idle.js";
import { MessageTrayManager } from "../managers/message-tray/manager.js";
import { TimeoutAdapter } from "../managers/message-tray/timeout.js";

import { UrgencyAdapter } from "../managers/source/urgency.js";

import { SourceManager } from "../managers/source/manager.js";
import { ProcessingAdapter } from "../managers/source/processing.js";

import type { Position, SettingsManager } from "../utils/settings.js";
import {
  getMessageTrayContainer,
  resolveNotificationWidgets,
} from "./notification-widgets.js";

export class NotificationsManager {
  private messageTrayManager: MessageTrayManager;
  private sourceManager: SourceManager;

  private fullscreenAdapter: FullscreenAdapter;
  private idleAdapter: IdleAdapter;
  private timeoutAdapter: TimeoutAdapter;
  private urgencyAdapter: UrgencyAdapter;
  private processingAdapter: ProcessingAdapter;

  constructor(settingsManager: SettingsManager) {
    this.messageTrayManager = new MessageTrayManager(settingsManager);
    this.sourceManager = new SourceManager(settingsManager);

    this.fullscreenAdapter = new FullscreenAdapter(settingsManager);
    this.idleAdapter = new IdleAdapter(settingsManager);
    this.timeoutAdapter = new TimeoutAdapter(settingsManager);
    this.urgencyAdapter = new UrgencyAdapter(settingsManager);
    this.processingAdapter = new ProcessingAdapter(settingsManager);

    this.fullscreenAdapter.register(this.messageTrayManager);
    this.idleAdapter.register(this.messageTrayManager);
    this.timeoutAdapter.register(this.messageTrayManager);
    this.urgencyAdapter.register(this.sourceManager);
    this.processingAdapter.register(this.sourceManager);

    this.setupPositioning(settingsManager);

    this.enable();
  }

  private positionSignalId?: number;

  private static readonly ALIGNMENT_MAP: Record<Position, Clutter.ActorAlign> =
    {
      fill: Clutter.ActorAlign.FILL,
      left: Clutter.ActorAlign.START,
      right: Clutter.ActorAlign.END,
      center: Clutter.ActorAlign.CENTER,
    };

  private setupPositioning(settingsManager: SettingsManager) {
    Main.messageTray.bannerAlignment =
      NotificationsManager.ALIGNMENT_MAP[settingsManager.notificationPosition];

    settingsManager.events.on("notificationPositionChanged", (position) => {
      Main.messageTray.bannerAlignment =
        NotificationsManager.ALIGNMENT_MAP[position];
    });

    const messageTrayContainer = getMessageTrayContainer();
    this.positionSignalId = messageTrayContainer?.connect("child-added", () => {
      const widgets = resolveNotificationWidgets(messageTrayContainer);
      if (!widgets) return;

      const { sourceName, titleText, bodyText } = widgets;

      const position = settingsManager.getPositionFor(
        sourceName,
        titleText,
        bodyText,
      );
      Main.messageTray.bannerAlignment =
        NotificationsManager.ALIGNMENT_MAP[position];

      const margins = settingsManager.getMarginsFor(
        sourceName,
        titleText,
        bodyText,
      );
      if (margins) {
        widgets.container.set_style(
          `margin-top: ${margins.top}px; margin-bottom: ${margins.bottom}px; margin-left: ${margins.left}px; margin-right: ${margins.right}px;`,
        );
      }
    });
  }

  private enable() {
    this.messageTrayManager.enable();
    this.sourceManager.enable();
  }

  private disable() {
    this.sourceManager.disable();
    this.messageTrayManager.disable();
  }

  dispose() {
    this.disable();

    if (typeof this.positionSignalId === "number") {
      getMessageTrayContainer()?.disconnect(this.positionSignalId);
      this.positionSignalId = undefined;
    }

    this.fullscreenAdapter.dispose();
    this.idleAdapter.dispose();
    this.timeoutAdapter.dispose();
    this.urgencyAdapter.dispose();
    this.processingAdapter.dispose();

    this.messageTrayManager.dispose();
    this.sourceManager.dispose();

    Main.messageTray.bannerAlignment = Clutter.ActorAlign.CENTER;
  }
}
