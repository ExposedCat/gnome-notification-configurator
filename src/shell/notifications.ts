import Clutter from "gi://Clutter";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { MessageTrayProto } from "resource:///org/gnome/shell/ui/messageTray.js";

import { FullscreenAdapter } from "../managers/message-tray/fullscreen.js";
import { IdleAdapter } from "../managers/message-tray/idle.js";
import { MessageTrayManager } from "../managers/message-tray/manager.js";
import { TimeoutAdapter } from "../managers/message-tray/timeout.js";

import { UrgencyAdapter } from "../managers/source/urgency.js";

import { SourceManager } from "../managers/source/manager.js";
import { ProcessingAdapter } from "../managers/source/processing.js";

import type { SettingsManager } from "../utils/settings.js";

export class NotificationsManager {
	private messageTrayManager: MessageTrayManager;
	private sourceManager: SourceManager;
	private settingsManager: SettingsManager;
	private horizontalPositionListenerId?: number;
	private verticalPositionListenerId?: number;

	private fullscreenAdapter: FullscreenAdapter;
	private idleAdapter: IdleAdapter;
	private timeoutAdapter: TimeoutAdapter;
	private urgencyAdapter: UrgencyAdapter;
	private processingAdapter: ProcessingAdapter;

	constructor(settingsManager: SettingsManager) {
		this.settingsManager = settingsManager;
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

		this.setupPositioning();

		this.enable();
	}

	private setupPositioning() {
		const settingsManager = this.settingsManager;

		const setHorizontalPosition = (
			position: "fill" | "left" | "right" | "center",
		) => {
			Main.messageTray.bannerAlignment = {
				fill: Clutter.ActorAlign.FILL,
				left: Clutter.ActorAlign.START,
				right: Clutter.ActorAlign.END,
				center: Clutter.ActorAlign.CENTER,
			}[position];
		};

		const updateVerticalPosition = (tray: MessageTrayProto) => {
			const bannerTray = tray as MessageTrayProto & {
				_bannerBin?: Clutter.Actor;
			};
			const actor = bannerTray._bannerBin;
			if (!actor) {
				return;
			}

			if (!actor.get_stage()) {
				const [translationX, , translationZ] = actor.get_translation();
				actor.set_translation(translationX, 0, translationZ);
				return;
			}

			const verticalPosition = settingsManager.notificationVerticalPosition;
			const [, stageY] = actor.get_transformed_position();
			const [, actorHeight] = actor.get_transformed_size();

			if (actorHeight === 0) {
				return;
			}

			const monitorIndex = Main.layoutManager.findIndexForActor(actor);
			const workArea = Main.layoutManager.getWorkAreaForMonitor(monitorIndex);
			const availableSpan = Math.max(workArea.height - actorHeight, 0);

			const targetOffset =
				verticalPosition === "center"
					? availableSpan / 2
					: verticalPosition === "bottom"
						? availableSpan
						: 0;
			const target = workArea.y + targetOffset;

			const [translationX, currentTranslationY, translationZ] =
				actor.get_translation();
			const baseStageY = stageY - currentTranslationY;
			const translationY = Math.round(target - baseStageY);

			if (translationY !== currentTranslationY) {
				actor.set_translation(translationX, translationY, translationZ);
			}
		};

		this.messageTrayManager.registerUpdateStateHook((original, { tray }) => {
			original();
			updateVerticalPosition(tray);
		});

		setHorizontalPosition(settingsManager.notificationPosition);
		updateVerticalPosition(Main.messageTray as unknown as MessageTrayProto);

		this.horizontalPositionListenerId = settingsManager.events.on(
			"notificationPositionChanged",
			(position) => {
				setHorizontalPosition(position);
			},
		);

		this.verticalPositionListenerId = settingsManager.events.on(
			"notificationVerticalPositionChanged",
			() => {
				updateVerticalPosition(Main.messageTray as unknown as MessageTrayProto);
			},
		);
	}

	private resetVerticalTranslations(tray?: MessageTrayProto) {
		const targetTray =
			tray ?? (Main.messageTray as unknown as MessageTrayProto);
		const bannerTray = targetTray as MessageTrayProto & {
			_bannerBin?: Clutter.Actor;
		};
		const actor = bannerTray._bannerBin;

		if (!actor) {
			return;
		}

		const [translationX, , translationZ] = actor.get_translation();
		actor.set_translation(translationX, 0, translationZ);
	}

	private enable() {
		this.messageTrayManager.enable();
		this.sourceManager.enable();
	}

	private disable() {
		if (this.horizontalPositionListenerId !== undefined) {
			this.settingsManager.events.off(this.horizontalPositionListenerId);
			this.horizontalPositionListenerId = undefined;
		}

		if (this.verticalPositionListenerId !== undefined) {
			this.settingsManager.events.off(this.verticalPositionListenerId);
			this.verticalPositionListenerId = undefined;
		}

		this.sourceManager.disable();
		this.messageTrayManager.disable();

		this.resetVerticalTranslations();
		Main.messageTray.bannerAlignment = Clutter.ActorAlign.CENTER;
	}

	dispose() {
		this.disable();

		this.fullscreenAdapter.dispose();
		this.idleAdapter.dispose();
		this.timeoutAdapter.dispose();
		this.urgencyAdapter.dispose();
		this.processingAdapter.dispose();

		this.messageTrayManager.dispose();
		this.sourceManager.dispose();
	}
}
