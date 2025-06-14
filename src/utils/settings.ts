import type Gio from "gi://Gio?version=2.0";
import { TypedEventEmitter } from "./event-emitter.js";

type SettingsEvents = {
	colorsEnabledChanged: [boolean];
	rateLimitingEnabledChanged: [boolean];
	notificationThresholdChanged: [number];
};

export class SettingsManager {
	private settings: Gio.Settings;
	private settingSignals: number[] = [];

	private _colorsEnabled!: boolean;
	private _rateLimitingEnabled!: boolean;
	private _notificationThreshold!: number;
	private _colors: Record<string, string | undefined> = {};

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

	get notificationThreshold() {
		return this._notificationThreshold;
	}

	getColorFor(partial: string) {
		for (const [app, color] of Object.entries(this._colors)) {
			if (
				partial.includes(app.toLowerCase()) ||
				app.toLowerCase().includes(partial)
			) {
				return color as string;
			}
		}
	}

	private load() {
		this._colorsEnabled = this.settings.get_boolean("enable-custom-colors");
		this._rateLimitingEnabled = this.settings.get_boolean(
			"enable-rate-limiting",
		);
		this._notificationThreshold = this.settings.get_int(
			"notification-threshold",
		);
	}

	private listen() {
		this.settingSignals.push(
			this.settings.connect("changed::enable-custom-colors", () => {
				this._colorsEnabled = this.settings.get_boolean("enable-custom-colors");
				this.events.emit("colorsEnabledChanged", this._colorsEnabled);
			}),
		);
		this.settingSignals.push(
			this.settings.connect("changed::app-colors", () => {
				const colors = this.settings.get_string("app-colors");
				try {
					this._colors = JSON.parse(colors);
				} catch (error) {
					logError(error);
					this.settings.set_string("app-colors", "{}");
				}
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
	}
}
