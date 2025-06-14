import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import type { NotificationTheme } from "./utils/themes.js";

export const DEFAULT_THEME: NotificationTheme = {
	appNameColor: [0.6, 0.6, 0.607843137, 1],
	timeColor: [0.6, 0.6, 0.607843137, 1],
	backgroundColor: [0.329411765, 0.329411765, 0.352941176, 1],
	titleColor: [0.992156863, 0.992156863, 0.992156863, 1],
	bodyColor: [0.992156863, 0.992156863, 0.992156863, 1],
};

interface AppThemeEntry {
	name: string;
	theme: NotificationTheme;
}

export default class NotificationConfiguratorPreferences extends ExtensionPreferences {
	private settings!: Gio.Settings;
	private appThemesList!: Gtk.ListBox;
	private appThemesData: AppThemeEntry[] = [];

	fillPreferencesWindow(window: Adw.PreferencesWindow) {
		this.settings = this.getSettings();
		this.loadAppThemesData();

		// General Settings Page
		const generalPage = new Adw.PreferencesPage({
			title: "General",
			icon_name: "preferences-system-symbolic",
		});
		window.add(generalPage);

		// Rate Limiting Group
		const rateLimitGroup = new Adw.PreferencesGroup({
			title: "Rate Limiting",
			description: "Control notification frequency per application",
		});
		generalPage.add(rateLimitGroup);

		// Enable rate limiting switch
		const enableRateLimitRow = new Adw.SwitchRow({
			title: "Enable Rate Limiting",
			subtitle: "Prevent duplicate notifications within threshold time",
		});
		this.settings.bind(
			"enable-rate-limiting",
			enableRateLimitRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		rateLimitGroup.add(enableRateLimitRow);

		// Notification threshold
		const thresholdRow = new Adw.SpinRow({
			title: "Notification Threshold",
			subtitle: "Time in milliseconds before allowing duplicate notifications",
			adjustment: new Gtk.Adjustment({
				lower: 100,
				upper: 60000,
				step_increment: 100,
				page_increment: 1000,
			}),
		});
		this.settings.bind(
			"notification-threshold",
			thresholdRow,
			"value",
			Gio.SettingsBindFlags.DEFAULT,
		);
		rateLimitGroup.add(thresholdRow);

		// Themes Settings Page
		const themesPage = new Adw.PreferencesPage({
			title: "Themes",
			icon_name: "applications-graphics-symbolic",
		});
		window.add(themesPage);

		// Theme Settings Group
		const themeGroup = new Adw.PreferencesGroup({
			title: "Notification Themes",
			description: "Customize notification appearance by application",
		});
		themesPage.add(themeGroup);

		// Enable custom themes switch
		const enableThemesRow = new Adw.SwitchRow({
			title: "Enable Custom Themes",
			subtitle: "Apply custom themes to notifications",
		});
		this.settings.bind(
			"enable-custom-colors",
			enableThemesRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		themeGroup.add(enableThemesRow);

		// App Themes List Group
		const appThemesGroup = new Adw.PreferencesGroup({
			title: "Application Themes",
			description: "Set custom themes for specific applications",
		});
		themesPage.add(appThemesGroup);

		// Create list box for app themes
		this.appThemesList = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ["boxed-list"],
		});
		appThemesGroup.add(this.appThemesList);

		// Add button
		const addButton = new Gtk.Button({
			label: "Add Application Theme",
			css_classes: ["suggested-action"],
			margin_top: 12,
		});
		addButton.connect("clicked", () => {
			this.addAppThemeEntry("", { ...DEFAULT_THEME });
		});
		appThemesGroup.add(addButton);

		// Populate existing entries
		this.populateAppThemesList();
	}

	private loadAppThemesData() {
		try {
			const appColorsJson = this.settings.get_string("app-themes");
			const appColors = JSON.parse(appColorsJson);

			this.appThemesData = Object.entries(appColors).map(([name, theme]) => ({
				name,
				theme: theme as NotificationTheme,
			}));
		} catch {
			this.appThemesData = [];
		}
	}

	private saveAppThemesData() {
		const themes = this.appThemesData.reduce(
			(list, entry) => {
				if (entry.name.trim()) {
					list[entry.name] = entry.theme;
				}
				return list;
			},
			{} as Record<string, NotificationTheme>,
		);

		this.settings.set_string("app-themes", JSON.stringify(themes));
	}

	private populateAppThemesList() {
		// Clear existing rows
		let child = this.appThemesList.get_first_child();
		while (child) {
			const next = child.get_next_sibling();
			this.appThemesList.remove(child);
			child = next;
		}

		// Add rows for existing data
		for (let i = 0; i < this.appThemesData.length; i++) {
			this.addAppThemeRow(i);
		}
	}

	private addAppThemeEntry(name: string, theme: NotificationTheme) {
		const index = this.appThemesData.length;
		this.appThemesData.push({ name, theme });
		this.addAppThemeRow(index);
		this.saveAppThemesData();
	}

	private addAppThemeRow(index: number) {
		const entry = this.appThemesData[index];

		// Main container
		const mainBox = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			spacing: 12,
			margin_top: 12,
			margin_bottom: 12,
			margin_start: 12,
			margin_end: 12,
		});

		// Header row with app name and remove button
		const headerRow = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 12,
		});

		// App name entry
		const nameEntry = new Gtk.Entry({
			text: entry.name,
			placeholder_text: "Application name",
			hexpand: true,
		});

		nameEntry.connect("changed", () => {
			this.appThemesData[index].name = nameEntry.get_text();
			this.saveAppThemesData();
		});

		// Remove button
		const removeButton = new Gtk.Button({
			icon_name: "user-trash-symbolic",
			css_classes: ["destructive-action"],
			valign: Gtk.Align.CENTER,
		});

		removeButton.connect("clicked", () => {
			this.appThemesData.splice(index, 1);
			this.populateAppThemesList();
			this.saveAppThemesData();
		});

		headerRow.append(nameEntry);
		headerRow.append(removeButton);

		// Colors grid
		const colorsGrid = new Gtk.Grid({
			column_spacing: 12,
			row_spacing: 6,
			margin_top: 6,
		});

		// Color entries
		const colorEntries = [
			{ key: "backgroundColor", label: "Background" },
			{ key: "titleColor", label: "Title" },
			{ key: "bodyColor", label: "Body Text" },
			{ key: "appNameColor", label: "App Name" },
			{ key: "timeColor", label: "Time" },
		] as const;

		colorEntries.forEach((colorEntry, i) => {
			const row = Math.floor(i / 2);
			const col = (i % 2) * 2;

			// Label
			const label = new Gtk.Label({
				label: colorEntry.label,
				halign: Gtk.Align.START,
				css_classes: ["caption"],
			});
			colorsGrid.attach(label, col, row, 1, 1);

			// Color button
			const colorButton = new Gtk.ColorButton({
				use_alpha: false,
				halign: Gtk.Align.START,
			});

			const [red, green, blue, alpha] = entry.theme[colorEntry.key];
			colorButton.set_rgba(new Gdk.RGBA({ red, green, blue, alpha }));

			colorButton.connect("color-set", () => {
				const color = colorButton.get_rgba();
				this.appThemesData[index].theme[colorEntry.key] = [
					color.red,
					color.green,
					color.blue,
					color.alpha,
				];
				this.saveAppThemesData();
			});

			colorsGrid.attach(colorButton, col + 1, row, 1, 1);
		});

		mainBox.append(headerRow);
		mainBox.append(colorsGrid);

		// Add separator except for last item
		if (index < this.appThemesData.length - 1) {
			const separator = new Gtk.Separator({
				orientation: Gtk.Orientation.HORIZONTAL,
				margin_top: 6,
			});
			mainBox.append(separator);
		}

		const listBoxRow = new Gtk.ListBoxRow({
			child: mainBox,
			activatable: false,
			selectable: false,
		});

		this.appThemesList.append(listBoxRow);
	}
}
