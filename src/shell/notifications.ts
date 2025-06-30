import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { FullscreenAdapter } from "../managers/message-tray/fullscreen.js";
import { IdleAdapter } from "../managers/message-tray/idle.js";
import { MessageTrayManager } from "../managers/message-tray/manager.js";
import { TimeoutAdapter } from "../managers/message-tray/timeout.js";

import { NotificationManager } from "../managers/notification/manager.js";
import { UrgencyAdapter } from "../managers/notification/urgency.js";

import { SourceManager } from "../managers/source/manager.js";
import { ProcessingAdapter } from "../managers/source/processing.js";

import type { SettingsManager } from "../utils/settings.js";

export class NotificationsManager {
	private messageTrayManager: MessageTrayManager;
	private notificationManager: NotificationManager;
	private sourceManager: SourceManager;

	private fullscreenAdapter: FullscreenAdapter;
	private idleAdapter: IdleAdapter;
	private timeoutAdapter: TimeoutAdapter;
	private urgencyAdapter: UrgencyAdapter;
	private processingAdapter: ProcessingAdapter;

	constructor(settingsManager: SettingsManager) {
		this.messageTrayManager = new MessageTrayManager(settingsManager);
		this.notificationManager = new NotificationManager(settingsManager);
		this.sourceManager = new SourceManager(settingsManager);

		this.fullscreenAdapter = new FullscreenAdapter(settingsManager);
		this.idleAdapter = new IdleAdapter(settingsManager);
		this.timeoutAdapter = new TimeoutAdapter(settingsManager);
		this.urgencyAdapter = new UrgencyAdapter(settingsManager);
		this.processingAdapter = new ProcessingAdapter(settingsManager);

		this.fullscreenAdapter.register(this.messageTrayManager);
		this.idleAdapter.register(this.messageTrayManager);
		this.timeoutAdapter.register(this.messageTrayManager);
		this.urgencyAdapter.register(this.notificationManager);
		this.processingAdapter.register(this.sourceManager);

		this.setupPositioning(settingsManager);

		this.enable();
	}

	private setupPositioning(settingsManager: SettingsManager) {
		const setPosition = (position: "fill" | "left" | "right" | "center") => {
			Main.messageTray.bannerAlignment = {
				fill: Clutter.ActorAlign.FILL,
				left: Clutter.ActorAlign.START,
				right: Clutter.ActorAlign.END,
				center: Clutter.ActorAlign.CENTER,
			}[position];
		};

		setPosition(settingsManager.notificationPosition);

		settingsManager.events.on("notificationPositionChanged", (position) => {
			setPosition(position);
		});
	}

	private enable() {
		this.messageTrayManager.enable();
		this.notificationManager.enable();
		this.sourceManager.enable();
	}

	private disable() {
		this.sourceManager.disable();
		this.notificationManager.disable();
		this.messageTrayManager.disable();
	}

	dispose() {
		this.disable();

		this.fullscreenAdapter.dispose();
		this.idleAdapter.dispose();
		this.timeoutAdapter.dispose();
		this.urgencyAdapter.dispose();
		this.processingAdapter.dispose();

		this.messageTrayManager.dispose();
		this.notificationManager.dispose();
		this.sourceManager.dispose();

		Main.messageTray.bannerAlignment = Clutter.ActorAlign.CENTER;
	}
}
