import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageTray from "resource:///org/gnome/shell/ui/messageTray.js";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";

import { FullscreenAdapter } from "../managers/message-tray/fullscreen.js";
import { IdleAdapter } from "../managers/message-tray/idle.js";
import { MessageTrayManager } from "../managers/message-tray/manager.js";
import { TimeoutAdapter } from "../managers/message-tray/timeout.js";

import { UrgencyAdapter } from "../managers/source/urgency.js";

import { SourceManager } from "../managers/source/manager.js";
import { ProcessingAdapter } from "../managers/source/processing.js";

import type {
  Position,
  SettingsManager,
  VerticalPosition,
} from "../utils/settings.js";
import {
  getBannerBin,
  getMessageTrayContainer,
  resolveNotificationWidgets,
} from "./notification-widgets.js";

const ANIMATION_TIME = 200;

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
  private injectionManager = new InjectionManager();

  private static readonly HORIZONTAL_ALIGNMENT_MAP: Record<
    Position,
    Clutter.ActorAlign
  > = {
    fill: Clutter.ActorAlign.FILL,
    left: Clutter.ActorAlign.START,
    right: Clutter.ActorAlign.END,
    center: Clutter.ActorAlign.CENTER,
  };

  private static readonly VERTICAL_ALIGNMENT_MAP: Record<
    VerticalPosition,
    Clutter.ActorAlign
  > = {
    fill: Clutter.ActorAlign.FILL,
    top: Clutter.ActorAlign.START,
    bottom: Clutter.ActorAlign.END,
    center: Clutter.ActorAlign.CENTER,
  };

  private isVerticalAlignTop() {
    return (
      getBannerBin()?.get_y_align() === Clutter.ActorAlign.START ||
      getBannerBin()?.get_y_align() === Clutter.ActorAlign.FILL
    );
  }

  private patchAnimations() {
    const proto = MessageTray.MessageTray
      .prototype as unknown as MessageTray.MessageTrayProto;

    const self = this;

    this.injectionManager.overrideMethod(
      proto,
      "_showNotification",
      (original) =>
        function (this: MessageTray.MessageTrayProto) {
          original.call(this);
          if (!self.isVerticalAlignTop()) {
            this._bannerBin.y = 0;
          }
        },
    );

    this.injectionManager.overrideMethod(
      proto,
      "_updateShowingNotification",
      (original) =>
        function (this: MessageTray.MessageTrayProto) {
          if (self.isVerticalAlignTop()) {
            original.call(this);
            return;
          }

          this._notificationState = MessageTray.State.SHOWING;
          this._bannerBin.remove_all_transitions();
          this._bannerBin.set_pivot_point(0.5, 0.5);
          this._bannerBin.scale_x = 0.9;
          this._bannerBin.scale_y = 0.9;
          this._bannerBin.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
              this._notificationState = MessageTray.State.SHOWN;
              this._showNotificationCompleted();
              this._updateState();
            },
          });
        },
    );

    this.injectionManager.overrideMethod(
      proto,
      "_hideNotification",
      (original) =>
        function (this: MessageTray.MessageTrayProto, animate) {
          if (self.isVerticalAlignTop()) {
            original.call(this, animate);
            return;
          }

          this._notificationFocusGrabber.ungrabFocus();
          this._banner?.disconnectObject(this);
          this._resetNotificationLeftTimeout();
          this._bannerBin.remove_all_transitions();

          const duration = animate ? ANIMATION_TIME : 0;
          this._notificationState = MessageTray.State.HIDING;
          this._bannerBin.ease({
            opacity: 0,
            scale_x: 0.9,
            scale_y: 0.9,
            duration,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
              this._notificationState = MessageTray.State.HIDDEN;
              this._hideNotificationCompleted();
              this._updateState();
            },
          });
        },
    );
  }

  private setupPositioning(settingsManager: SettingsManager) {
    const bannerBin = getBannerBin();

    Main.messageTray.bannerAlignment =
      NotificationsManager.HORIZONTAL_ALIGNMENT_MAP[
        settingsManager.notificationPosition
      ];
    bannerBin?.set_y_align(
      NotificationsManager.VERTICAL_ALIGNMENT_MAP[
        settingsManager.verticalPosition
      ],
    );

    settingsManager.events.on("notificationPositionChanged", (position) => {
      Main.messageTray.bannerAlignment =
        NotificationsManager.HORIZONTAL_ALIGNMENT_MAP[position];
    });

    settingsManager.events.on("verticalPositionChanged", (verticalPosition) => {
      bannerBin?.set_y_align(
        NotificationsManager.VERTICAL_ALIGNMENT_MAP[verticalPosition],
      );
    });

    this.patchAnimations();

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
        NotificationsManager.HORIZONTAL_ALIGNMENT_MAP[position];

      const verticalPosition = settingsManager.getVerticalPositionFor(
        sourceName,
        titleText,
        bodyText,
      );
      bannerBin?.set_y_align(
        NotificationsManager.VERTICAL_ALIGNMENT_MAP[verticalPosition],
      );

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
    this.injectionManager.clear();

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
    getBannerBin()?.set_y_align(Clutter.ActorAlign.START);
  }
}
