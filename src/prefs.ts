import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import Adw from "gi://Adw";
import Gdk from "gi://Gdk";

interface AppColorEntry {
	name: string;
	color: string;
}

export default class NotificationConfiguratorPreferences extends ExtensionPreferences {
	private settings!: Gio.Settings;
	private appColorsList!: Gtk.ListBox;
	private appColorsData: AppColorEntry[] = [];

	fillPreferencesWindow(window: Adw.PreferencesWindow) {
		this.settings = this.getSettings();
		this.loadAppColorsData();

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

		// Colors Settings Page
		const colorsPage = new Adw.PreferencesPage({
			title: "Colors",
			icon_name: "applications-graphics-symbolic",
		});
		window.add(colorsPage);

		// Color Settings Group
		const colorGroup = new Adw.PreferencesGroup({
			title: "Notification Colors",
			description: "Customize notification background colors by application",
		});
		colorsPage.add(colorGroup);

		// Enable custom colors switch
		const enableColorsRow = new Adw.SwitchRow({
			title: "Enable Custom Colors",
			subtitle: "Apply custom background colors to notifications",
		});
		this.settings.bind(
			"enable-custom-colors",
			enableColorsRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		colorGroup.add(enableColorsRow);

		// App Colors List Group
		const appColorsGroup = new Adw.PreferencesGroup({
			title: "Application Colors",
			description: "Set custom colors for specific applications",
		});
		colorsPage.add(appColorsGroup);

		// Create list box for app colors
		this.appColorsList = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ["boxed-list"],
		});
		appColorsGroup.add(this.appColorsList);

		// Add button
		const addButton = new Gtk.Button({
			label: "Add Application Color",
			css_classes: ["suggested-action"],
			margin_top: 12,
		});
		addButton.connect("clicked", () => {
			this.addAppColorEntry("", "#ffffff");
		});
		appColorsGroup.add(addButton);

		// Populate existing entries
		this.populateAppColorsList();
	}

	private loadAppColorsData() {
		try {
			const appColorsJson = this.settings.get_string("app-colors");
			const appColors = JSON.parse(appColorsJson);
			this.appColorsData = Object.entries(appColors).map(([name, color]) => ({
				name,
				color: color as string,
			}));
		} catch {
			this.appColorsData = [];
		}
	}

	private saveAppColorsData() {
		const colors = this.appColorsData.reduce(
			(list, entry) => {
				if (entry.name.trim()) {
					list[entry.name] = entry.color;
				}
				return list;
			},
			{} as Record<string, string>,
		);

		this.settings.set_string("app-colors", JSON.stringify(colors));
	}

	private populateAppColorsList() {
		// Clear existing rows
		let child = this.appColorsList.get_first_child();
		while (child) {
			const next = child.get_next_sibling();
			this.appColorsList.remove(child);
			child = next;
		}

		// Add rows for existing data
		for (let i = 0; i < this.appColorsData.length; i++) {
			this.addAppColorRow(i);
		}
	}

	private addAppColorEntry(name: string, color: string) {
		const index = this.appColorsData.length;
		this.appColorsData.push({ name, color });
		this.addAppColorRow(index);
		this.saveAppColorsData();
	}

	private addAppColorRow(index: number) {
		const entry = this.appColorsData[index];

		const row = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 12,
			margin_top: 6,
			margin_bottom: 6,
			margin_start: 12,
			margin_end: 12,
		});

		// App name entry
		const nameEntry = new Gtk.Entry({
			text: entry.name,
			placeholder_text: "Application name",
			hexpand: true,
		});

		nameEntry.connect("changed", () => {
			this.appColorsData[index].name = nameEntry.get_text();
			this.saveAppColorsData();
		});

		// Color button
		const colorButton = new Gtk.ColorButton({
			valign: Gtk.Align.CENTER,
			use_alpha: false,
		});

		const rgba = new Gdk.RGBA();
		if (rgba.parse(entry.color)) {
			colorButton.set_rgba(rgba);
		}

		colorButton.connect("color-set", () => {
			const color = colorButton.get_rgba();
			const hexColor = this.rgbaToHex(color);
			this.appColorsData[index].color = hexColor;
			this.saveAppColorsData();
		});

		// Remove button
		const removeButton = new Gtk.Button({
			icon_name: "user-trash-symbolic",
			css_classes: ["destructive-action"],
			valign: Gtk.Align.CENTER,
		});

		removeButton.connect("clicked", () => {
			this.appColorsData.splice(index, 1);
			this.populateAppColorsList();
			this.saveAppColorsData();
		});

		row.append(nameEntry);
		row.append(colorButton);
		row.append(removeButton);

		const listBoxRow = new Gtk.ListBoxRow({
			child: row,
			activatable: false,
			selectable: false,
		});

		this.appColorsList.append(listBoxRow);
	}

	private rgbaToHex(rgba: Gdk.RGBA): string {
		const r = Math.round(rgba.red * 255);
		const g = Math.round(rgba.green * 255);
		const b = Math.round(rgba.blue * 255);
		return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
	}
}
