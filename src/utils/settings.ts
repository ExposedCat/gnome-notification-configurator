import type Gio from "gi://Gio?version=2.0";

import type { Notification } from "@girs/gnome-shell/ui/messageTray";
import { TypedEventEmitter } from "./event-emitter.js";
import type { NotificationTheme } from "./themes.js";

export type NotificationFilter = {
	title: string;
	body: string;
	appName: string;
	action: "hide" | "close";
};

type SettingsEvents = {
	colorsEnabledChanged: [boolean];
	rateLimitingEnabledChanged: [boolean];
	filteringEnabledChanged: [boolean];
	notificationThresholdChanged: [number];
	notificationPositionChanged: [Position];
	fullscreenEnabledChanged: [boolean];
};

export type Position = "fill" | "left" | "right" | "center";

export class SettingsManager {
	private settings: Gio.Settings;
	private settingSignals: number[] = [];

	private _colorsEnabled!: boolean;
	private _rateLimitingEnabled!: boolean;
	private _filteringEnabled!: boolean;
	private _fullscreenEnabled!: boolean;
	private _notificationThreshold!: number;
	private _themes: Record<string, NotificationTheme | undefined> = {};
	private _blockList: NotificationFilter[] = [];

	events = new TypedEventEmitter<SettingsEvents>();

	constructor(settings: Gio.Settings) {
		this.settings = settings;
		this.listen();
		this.load();
	}

	dispose() {
		for (const signal of this.settingSignals) {
			this.settings.disconnect(signal);
		}
	}

	get colorsEnabled() {
		return this._colorsEnabled;
	}

	get rateLimitingEnabled() {
		return this._rateLimitingEnabled;
	}

	get filteringEnabled() {
		return this._filteringEnabled;
	}

	get fullscreenEnabled() {
		return this._fullscreenEnabled;
	}

	get notificationThreshold() {
		return this._notificationThreshold;
	}

	get notificationPosition() {
		return (this.settings.get_string("notification-position") ??
			"center") as Position;
	}

	get blockList() {
		return this._blockList;
	}

	getFilterFor(
		notification: Notification,
		source: string,
	): NotificationFilter["action"] | null {
		for (const { title, body, appName, action } of this._blockList) {
			if (title.trim() && notification.title?.trim()) {
				if (this.matchesRegex(notification.title, title)) {
					return action;
				}
			}
			if (appName.trim() && source.trim()) {
				if (this.matchesRegex(source, appName)) {
					return action;
				}
			}
			if (body.trim() && notification.body?.trim()) {
				if (this.matchesRegex(notification.body, body)) {
					return action;
				}
			}
		}
		return null;
	}

	private matchesRegex(text: string, pattern: string): boolean {
		try {
			const regex = new RegExp(pattern, "i");
			return regex.test(text);
		} catch (error) {
			console.error("Invalid regex pattern:", pattern, error);
			return false;
		}
	}

	getThemeFor(partial: string) {
		for (const [app, color] of Object.entries(this._themes)) {
			if (app.toLowerCase().includes(partial.toLowerCase())) {
				return color as NotificationTheme;
			}
		}
	}

	private load() {
		this._colorsEnabled = this.settings.get_boolean("enable-custom-colors");
		this._rateLimitingEnabled = this.settings.get_boolean(
			"enable-rate-limiting",
		);
		this._filteringEnabled = this.settings.get_boolean("enable-filtering");
		this._fullscreenEnabled = this.settings.get_boolean("enable-fullscreen");
		this._notificationThreshold = this.settings.get_int(
			"notification-threshold",
		);
		this.loadThemes();
		this.loadBlockList();
	}

	private loadThemes() {
		const colors = this.settings.get_string("app-themes");
		try {
			this._themes = JSON.parse(colors);
		} catch (error) {
			logError(error);
			this.settings.set_string("app-themes", "{}");
		}
	}

	private loadBlockList() {
		const blockListJson = this.settings.get_string("block-list");
		try {
			this._blockList = JSON.parse(blockListJson);
		} catch (error) {
			logError(error);
			this.settings.set_string("block-list", "[]");
			this._blockList = [];
		}
	}

	private listen() {
		this.settingSignals.push(
			this.settings.connect("changed::enable-custom-colors", () => {
				this._colorsEnabled = this.settings.get_boolean("enable-custom-colors");
				this.events.emit("colorsEnabledChanged", this._colorsEnabled);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::app-themes", () => {
				this.loadThemes();
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::block-list", () => {
				this.loadBlockList();
			}),
		);

		this.settingSignals.push(
			this.settings.connect("changed::enable-rate-limiting", () => {
				this._rateLimitingEnabled = this.settings.get_boolean(
					"enable-rate-limiting",
				);
				this.events.emit(
					"rateLimitingEnabledChanged",
					this._rateLimitingEnabled,
				);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::enable-filtering", () => {
				this._filteringEnabled = this.settings.get_boolean("enable-filtering");
				this.events.emit("filteringEnabledChanged", this._filteringEnabled);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::notification-threshold", () => {
				this._notificationThreshold = this.settings.get_int(
					"notification-threshold",
				);
				this.events.emit(
					"notificationThresholdChanged",
					this._notificationThreshold,
				);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::notification-position", () => {
				this.events.emit(
					"notificationPositionChanged",
					this.notificationPosition,
				);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::enable-fullscreen", () => {
				this._fullscreenEnabled =
					this.settings.get_boolean("enable-fullscreen");
				this.events.emit("fullscreenEnabledChanged", this._fullscreenEnabled);
			}),
		);
	}
}
