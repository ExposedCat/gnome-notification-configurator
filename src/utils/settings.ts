import type Gio from "gi://Gio?version=2.0";

import type { Notification } from "@girs/gnome-shell/ui/messageTray";
import type { NotificationTheme } from "./constants.js";
import { TypedEventEmitter } from "./event-emitter.js";

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
	notificationTimeoutChanged: [number];
	ignoreIdleChanged: [boolean];
	alwaysNormalUrgencyChanged: [boolean];
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
	private _notificationTimeout!: number;
	private _ignoreIdle!: boolean;
	private _alwaysNormalUrgency!: boolean;
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

	get notificationTimeout() {
		return this._notificationTimeout;
	}

	get ignoreIdle() {
		return this._ignoreIdle;
	}

	get alwaysNormalUrgency() {
		return this._alwaysNormalUrgency;
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
			if (!title.trim() && !appName.trim() && !body.trim()) {
				continue;
			}

			const matches = [
				!title.trim() ||
					(notification.title?.trim() &&
						this.matchesRegex(notification.title, title)),

				!appName.trim() ||
					(source.trim() && this.matchesRegex(source, appName)),

				!body.trim() ||
					(notification.body?.trim() &&
						this.matchesRegex(notification.body, body)),
			];

			if (matches.every(Boolean)) {
				return action;
			}
		}
		return null;
	}

	isValidRegexPattern(pattern: string): boolean {
		if (!pattern.trim()) {
			return true;
		}

		try {
			new RegExp(pattern, "i");
			return true;
		} catch {
			return false;
		}
	}

	private matchesRegex(text: string, pattern: string): boolean {
		if (!pattern.trim()) {
			return false;
		}

		try {
			const regex = new RegExp(pattern, "i");
			return regex.test(text);
		} catch {
			return false;
		}
	}

	getThemeFor(appName: string) {
		for (const [pattern, color] of Object.entries(this._themes)) {
			const hasRegexChars = /[.*+?^${}()|[\]\\]/.test(pattern);

			if (hasRegexChars) {
				if (this.matchesRegex(appName, pattern)) {
					return color as NotificationTheme;
				}
			} else {
				if (
					pattern.toLowerCase().includes(appName.toLowerCase()) ||
					appName.toLowerCase().includes(pattern.toLowerCase())
				) {
					return color as NotificationTheme;
				}
			}
		}
		return undefined;
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
		this._notificationTimeout = this.settings.get_int("notification-timeout");
		this._ignoreIdle = this.settings.get_boolean("ignore-idle");
		this._alwaysNormalUrgency = this.settings.get_boolean(
			"always-normal-urgency",
		);
		this.loadThemes();
		this.loadBlockList();
	}

	private loadThemes() {
		const colors = this.settings.get_string("app-themes");
		try {
			this._themes = JSON.parse(colors);
		} catch (error) {
			console.error("Failed to parse app themes JSON:", error);
			this.settings.set_string("app-themes", "{}");
		}
	}

	private loadBlockList() {
		const blockListJson = this.settings.get_string("block-list");
		try {
			this._blockList = JSON.parse(blockListJson);
			this.validateBlockListPatterns();
		} catch (error) {
			console.error("Failed to parse block list JSON:", error);
			this.settings.set_string("block-list", "[]");
			this._blockList = [];
		}
	}

	private validateBlockListPatterns() {
		for (const filter of this._blockList) {
			if (filter.title?.trim()) {
				this.isValidRegexPattern(filter.title);
			}
			if (filter.body?.trim()) {
				this.isValidRegexPattern(filter.body);
			}
			if (filter.appName?.trim()) {
				this.isValidRegexPattern(filter.appName);
			}
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
		this.settingSignals.push(
			this.settings.connect("changed::notification-timeout", () => {
				this._notificationTimeout = this.settings.get_int(
					"notification-timeout",
				);
				this.events.emit(
					"notificationTimeoutChanged",
					this._notificationTimeout,
				);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::ignore-idle", () => {
				this._ignoreIdle = this.settings.get_boolean("ignore-idle");
				this.events.emit("ignoreIdleChanged", this._ignoreIdle);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::always-normal-urgency", () => {
				this._alwaysNormalUrgency = this.settings.get_boolean(
					"always-normal-urgency",
				);
				this.events.emit(
					"alwaysNormalUrgencyChanged",
					this._alwaysNormalUrgency,
				);
			}),
		);
	}
}
