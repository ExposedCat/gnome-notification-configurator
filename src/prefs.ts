import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import type { NotificationFilter } from "./utils/settings.js";
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

interface FilterEntry {
	filter: NotificationFilter;
}

export default class NotificationConfiguratorPreferences extends ExtensionPreferences {
	private settings!: Gio.Settings;
	private appThemesList!: Gtk.ListBox;
	private appThemesData: AppThemeEntry[] = [];
	private thresholdRow!: Adw.SpinRow;
	private appThemesGroup!: Adw.PreferencesGroup;
	private addButton!: Gtk.Button;

	private filtersList!: Gtk.ListBox;
	private filtersData: FilterEntry[] = [];
	private filtersGroup!: Adw.PreferencesGroup;
	private addFilterButton!: Gtk.Button;

	fillPreferencesWindow(window: Adw.PreferencesWindow) {
		this.settings = this.getSettings();
		this.loadAppThemesData();
		this.loadFiltersData();

		// General Settings Page
		const generalPage = new Adw.PreferencesPage({
			title: "General",
			icon_name: "preferences-system-symbolic",
		});
		window.add(generalPage);

		// Test notification group (at top)
		const testGroup = new Adw.PreferencesGroup({
			title: "Test Notifications",
			description: "Send test notifications to preview your settings",
		});
		generalPage.add(testGroup);

		// Test notification button
		const testButton = new Gtk.Button({
			label: "Send Test Notification",
			css_classes: ["suggested-action"],
			margin_top: 12,
		});
		testButton.connect("clicked", () => {
			this.sendTestNotification();
		});
		testGroup.add(testButton);

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
		this.thresholdRow = new Adw.SpinRow({
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
			this.thresholdRow,
			"value",
			Gio.SettingsBindFlags.DEFAULT,
		);

		// Set initial sensitivity for threshold
		this.thresholdRow.set_sensitive(
			this.settings.get_boolean("enable-rate-limiting"),
		);

		// Connect rate limiting switch to threshold sensitivity
		enableRateLimitRow.connect("notify::active", () => {
			this.thresholdRow.set_sensitive(enableRateLimitRow.get_active());
		});

		rateLimitGroup.add(this.thresholdRow);

		// General Settings Group
		const generalGroup = new Adw.PreferencesGroup({
			title: "General Settings",
			description: "Basic notification configuration",
		});
		generalPage.add(generalGroup);

		// Notification position
		const positionRow = new Adw.ComboRow({
			title: "Notification Position",
			subtitle: "Choose where notifications appear on screen",
		});

		const positionModel = new Gtk.StringList();
		positionModel.append("Fill Screen");
		positionModel.append("Left");
		positionModel.append("Center");
		positionModel.append("Right");
		positionRow.set_model(positionModel);

		// Set initial position
		const currentPosition = this.settings.get_string("notification-position");
		const positionMap = { fill: 0, left: 1, center: 2, right: 3 };
		positionRow.set_selected(
			positionMap[currentPosition as keyof typeof positionMap] ?? 2,
		);

		// Connect position change
		positionRow.connect("notify::selected", () => {
			const selected = positionRow.get_selected();
			const positions = ["fill", "left", "center", "right"];
			this.settings.set_string("notification-position", positions[selected]);
		});

		generalGroup.add(positionRow);

		// Filtering Settings Page
		const filteringPage = new Adw.PreferencesPage({
			title: "Filtering",
			icon_name: "action-unavailable-symbolic",
		});
		window.add(filteringPage);

		// Notification Filters Group
		const filterGroup = new Adw.PreferencesGroup({
			title: "Notification Filters",
			description:
				"Block or hide notifications based on title, body text, or application name",
		});
		filteringPage.add(filterGroup);

		// Enable filtering switch
		const enableFilteringRow = new Adw.SwitchRow({
			title: "Enable Filtering",
			subtitle: "Apply notification filters",
		});
		this.settings.bind(
			"enable-filtering",
			enableFilteringRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		filterGroup.add(enableFilteringRow);

		// Filters List Group
		this.filtersGroup = new Adw.PreferencesGroup({
			title: "Active Filters",
			description: "Configure filters to block unwanted notifications",
		});
		filteringPage.add(this.filtersGroup);

		// Create list box for filters
		this.filtersList = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ["boxed-list"],
		});
		this.filtersGroup.add(this.filtersList);

		// Add filter button
		this.addFilterButton = new Gtk.Button({
			label: "Add Filter",
			css_classes: ["suggested-action"],
			margin_top: 12,
		});
		this.addFilterButton.connect("clicked", () => {
			this.addFilterEntry({
				title: "",
				body: "",
				appName: "",
				action: "hide",
			});
		});
		this.filtersGroup.add(this.addFilterButton);

		// Set initial sensitivity for filters
		const filteringEnabled = this.settings.get_boolean("enable-filtering");
		this.filtersGroup.set_sensitive(filteringEnabled);
		this.addFilterButton.set_sensitive(filteringEnabled);

		// Connect filtering switch to filters sensitivity
		enableFilteringRow.connect("notify::active", () => {
			const enabled = enableFilteringRow.get_active();
			this.filtersGroup.set_sensitive(enabled);
			this.addFilterButton.set_sensitive(enabled);

			// Update sensitivity for all existing filter rows
			let rowChild = this.filtersList.get_first_child();
			while (rowChild) {
				rowChild.set_sensitive(enabled);
				rowChild = rowChild.get_next_sibling();
			}
		});

		// Populate existing filter entries
		this.populateFiltersList();

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
		this.appThemesGroup = new Adw.PreferencesGroup({
			title: "Application Themes",
			description: "Set custom themes for specific applications",
		});
		themesPage.add(this.appThemesGroup);

		// Create list box for app themes
		this.appThemesList = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ["boxed-list"],
		});
		this.appThemesGroup.add(this.appThemesList);

		// Add button
		this.addButton = new Gtk.Button({
			label: "Add Application Theme",
			css_classes: ["suggested-action"],
			margin_top: 12,
		});
		this.addButton.connect("clicked", () => {
			this.addAppThemeEntry("", { ...DEFAULT_THEME });
		});
		this.appThemesGroup.add(this.addButton);

		// Set initial sensitivity for themes
		const themesEnabled = this.settings.get_boolean("enable-custom-colors");
		this.appThemesGroup.set_sensitive(themesEnabled);
		this.addButton.set_sensitive(themesEnabled);

		// Connect themes switch to themes sensitivity
		enableThemesRow.connect("notify::active", () => {
			const enabled = enableThemesRow.get_active();
			this.appThemesGroup.set_sensitive(enabled);
			this.addButton.set_sensitive(enabled);

			// Update sensitivity for all existing theme rows
			let rowChild = this.appThemesList.get_first_child();
			while (rowChild) {
				rowChild.set_sensitive(enabled);
				rowChild = rowChild.get_next_sibling();
			}
		});

		// Populate existing entries
		this.populateAppThemesList();

		// Set cleanup for window close
		this.setCleanup(window);
	}

	private loadFiltersData() {
		try {
			const blockListJson = this.settings.get_string("block-list");
			const blockList = JSON.parse(blockListJson);

			this.filtersData = blockList.map((filter: NotificationFilter) => ({
				filter,
			}));
		} catch {
			this.filtersData = [];
		}
	}

	private saveFiltersData() {
		const filters = this.filtersData.map((entry) => entry.filter);
		this.settings.set_string("block-list", JSON.stringify(filters));
	}

	private populateFiltersList() {
		// Clear existing rows
		let child = this.filtersList.get_first_child();
		while (child) {
			const next = child.get_next_sibling();
			this.filtersList.remove(child);
			child = next;
		}

		// Add rows for existing data
		const filteringEnabled = this.settings.get_boolean("enable-filtering");
		for (let i = 0; i < this.filtersData.length; i++) {
			this.addFilterRow(i);
		}

		// Set sensitivity for all filter rows based on filtering enabled state
		let rowChild = this.filtersList.get_first_child();
		while (rowChild) {
			rowChild.set_sensitive(filteringEnabled);
			rowChild = rowChild.get_next_sibling();
		}
	}

	private addFilterEntry(filter: NotificationFilter) {
		const index = this.filtersData.length;
		this.filtersData.push({ filter });
		this.addFilterRow(index);
		this.saveFiltersData();

		// Set sensitivity for the newly added row
		const filteringEnabled = this.settings.get_boolean("enable-filtering");
		const lastChild = this.filtersList.get_last_child();
		if (lastChild) {
			lastChild.set_sensitive(filteringEnabled);
		}
	}

	private addFilterRow(index: number) {
		const entry = this.filtersData[index];

		// Main container
		const mainBox = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			spacing: 12,
			margin_top: 12,
			margin_bottom: 12,
			margin_start: 12,
			margin_end: 12,
		});

		// Header row with action combo and remove button
		const headerRow = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 12,
		});

		// Action label
		const actionLabel = new Gtk.Label({
			label: "Action:",
			halign: Gtk.Align.START,
		});

		// Action combo
		const actionCombo = new Gtk.ComboBoxText();
		actionCombo.append("hide", "Hide notification");
		actionCombo.append("close", "Close notification");
		actionCombo.set_active_id(entry.filter.action);

		actionCombo.connect("changed", () => {
			const activeId = actionCombo.get_active_id();
			if (activeId) {
				this.filtersData[index].filter.action = activeId as "hide" | "close";
				this.saveFiltersData();
			}
		});

		// Test button for this filter
		const filterTestButton = new Gtk.Button({
			icon_name: "dialog-information-symbolic",
			css_classes: ["flat"],
			valign: Gtk.Align.CENTER,
			tooltip_text: "Test notification with this filter",
		});

		filterTestButton.connect("clicked", () => {
			this.sendTestNotificationForFilter(entry.filter);
		});

		// Remove button
		const removeButton = new Gtk.Button({
			icon_name: "user-trash-symbolic",
			css_classes: ["destructive-action"],
			valign: Gtk.Align.CENTER,
		});

		removeButton.connect("clicked", () => {
			this.filtersData.splice(index, 1);
			this.populateFiltersList();
			this.saveFiltersData();
		});

		headerRow.append(actionLabel);
		headerRow.append(actionCombo);
		headerRow.append(filterTestButton);
		headerRow.append(removeButton);

		// Filter fields grid
		const fieldsGrid = new Gtk.Grid({
			column_spacing: 12,
			row_spacing: 6,
			margin_top: 6,
		});

		// Title field
		const titleLabel = new Gtk.Label({
			label: "Title contains:",
			halign: Gtk.Align.START,
		});
		fieldsGrid.attach(titleLabel, 0, 0, 1, 1);

		const titleEntry = new Gtk.Entry({
			text: entry.filter.title,
			placeholder_text: "Leave empty to ignore title",
			hexpand: true,
		});
		titleEntry.connect("changed", () => {
			this.filtersData[index].filter.title = titleEntry.get_text();
			this.saveFiltersData();
		});
		fieldsGrid.attach(titleEntry, 1, 0, 1, 1);

		// Body field
		const bodyLabel = new Gtk.Label({
			label: "Body contains:",
			halign: Gtk.Align.START,
		});
		fieldsGrid.attach(bodyLabel, 0, 1, 1, 1);

		const bodyEntry = new Gtk.Entry({
			text: entry.filter.body,
			placeholder_text: "Leave empty to ignore body",
			hexpand: true,
		});
		bodyEntry.connect("changed", () => {
			this.filtersData[index].filter.body = bodyEntry.get_text();
			this.saveFiltersData();
		});
		fieldsGrid.attach(bodyEntry, 1, 1, 1, 1);

		// App name field
		const appNameLabel = new Gtk.Label({
			label: "App name contains:",
			halign: Gtk.Align.START,
		});
		fieldsGrid.attach(appNameLabel, 0, 2, 1, 1);

		const appNameEntry = new Gtk.Entry({
			text: entry.filter.appName,
			placeholder_text: "Leave empty to ignore app name",
			hexpand: true,
		});
		appNameEntry.connect("changed", () => {
			this.filtersData[index].filter.appName = appNameEntry.get_text();
			this.saveFiltersData();
		});
		fieldsGrid.attach(appNameEntry, 1, 2, 1, 1);

		mainBox.append(headerRow);
		mainBox.append(fieldsGrid);

		// Add separator except for last item
		if (index < this.filtersData.length - 1) {
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

		this.filtersList.append(listBoxRow);
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

		// Update sensitivity for all rows
		const themesEnabled = this.settings.get_boolean("enable-custom-colors");
		let rowChild = this.appThemesList.get_first_child();
		while (rowChild) {
			rowChild.set_sensitive(themesEnabled);
			rowChild = rowChild.get_next_sibling();
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

		// Test button for this theme
		const themeTestButton = new Gtk.Button({
			icon_name: "dialog-information-symbolic",
			css_classes: ["flat"],
			valign: Gtk.Align.CENTER,
			tooltip_text: "Test notification with this theme",
		});

		themeTestButton.connect("clicked", () => {
			this.sendTestNotificationForTheme(entry.name || "Test App");
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
		headerRow.append(themeTestButton);
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

		// Set initial sensitivity based on themes enabled state
		const themesEnabled = this.settings.get_boolean("enable-custom-colors");
		listBoxRow.set_sensitive(themesEnabled);

		this.appThemesList.append(listBoxRow);
	}

	private sendNotification(appName: string, title: string, body: string) {
		try {
			const proc = Gio.Subprocess.new(
				[
					"notify-send",
					`--app-name=${appName}`,
					"--icon=dialog-information",
					title,
					body,
				],
				Gio.SubprocessFlags.NONE,
			);
			proc.wait_async(null, null);
		} catch (error) {
			console.error("Failed to send notification:", error);
		}
	}

	private sendTestNotification() {
		this.sendNotification(
			"Notification Configurator",
			"Test Notification",
			"This is a test notification from Notification Configurator extension",
		);
	}

	private sendTestNotificationForTheme(appName: string) {
		const displayName = appName || "Notification Configurator";
		this.sendNotification(
			displayName,
			"Theme Test Notification",
			`This is a test notification for "${displayName}" theme configuration`,
		);
	}

	private sendTestNotificationForFilter(filter: NotificationFilter) {
		const title = filter.title || "Filter Test Title";
		const body = filter.body || "Filter test body content";
		const appName = filter.appName || "Filter Test App";

		this.sendNotification(
			appName,
			title,
			`${body} - This notification should be ${filter.action === "hide" ? "hidden" : "closed"} by your filter.`,
		);
	}

	private setCleanup(window: Adw.PreferencesWindow) {
		window.connect("close-request", () => {
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.settings = null!;
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.appThemesList = null!;
			this.appThemesData = [];
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.thresholdRow = null!;
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.appThemesGroup = null!;
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.addButton = null!;
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.filtersList = null!;
			this.filtersData = [];
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.filtersGroup = null!;
			// biome-ignore lint/style/noNonNullAssertion: cleanup
			this.addFilterButton = null!;
		});
	}
}
