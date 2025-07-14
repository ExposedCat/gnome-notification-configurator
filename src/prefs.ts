import Adw from "gi://Adw";
import Gdk from "gi://Gdk";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import {
	ExtensionPreferences,
	gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import type { NotificationTheme } from "./utils/constants.js";
import { DEFAULT_THEME } from "./utils/constants.js";
import type { NotificationFilter } from "./utils/settings.js";

type AppThemeEntry = {
	name: string;
	theme: NotificationTheme;
};

type FilterEntry = {
	filter: NotificationFilter;
};

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

		const generalPage = new Adw.PreferencesPage({
			title: _("General"),
			icon_name: "preferences-system-symbolic",
		});
		window.add(generalPage);

		this.addTestSection(generalPage);

		const rateLimitGroup = new Adw.PreferencesGroup({
			title: _("Rate Limiting"),
			description: _("Control notification frequency per application"),
		});
		generalPage.add(rateLimitGroup);

		const enableRateLimitRow = new Adw.SwitchRow({
			title: _("Enable Rate Limiting"),
			subtitle: _("Prevent duplicate notifications within threshold time"),
		});
		this.settings.bind(
			"enable-rate-limiting",
			enableRateLimitRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		rateLimitGroup.add(enableRateLimitRow);

		this.thresholdRow = new Adw.SpinRow({
			title: _("Notification Threshold"),
			subtitle: _(
				"Time in milliseconds before allowing duplicate notifications",
			),
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
		rateLimitGroup.add(this.thresholdRow);

		this.thresholdRow.set_sensitive(
			this.settings.get_boolean("enable-rate-limiting"),
		);

		enableRateLimitRow.connect("notify::active", () => {
			this.thresholdRow.set_sensitive(enableRateLimitRow.get_active());
		});

		const timeoutGroup = new Adw.PreferencesGroup({
			title: _("Notification Timeout"),
			description: _("Control how long notifications stay visible"),
		});
		generalPage.add(timeoutGroup);

		const timeoutRow = new Adw.SpinRow({
			title: _("Notification Timeout"),
			subtitle: _(
				"Time in milliseconds before auto-dismiss (0 = never dismiss)",
			),
			adjustment: new Gtk.Adjustment({
				lower: 0,
				upper: 30000,
				step_increment: 500,
				page_increment: 1000,
			}),
		});
		this.settings.bind(
			"notification-timeout",
			timeoutRow,
			"value",
			Gio.SettingsBindFlags.DEFAULT,
		);
		timeoutGroup.add(timeoutRow);

		const ignoreIdleRow = new Adw.SwitchRow({
			title: _("Ignore Idle State"),
			subtitle: _("Keep showing notifications even when user is idle"),
		});
		this.settings.bind(
			"ignore-idle",
			ignoreIdleRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		timeoutGroup.add(ignoreIdleRow);

		const forceNormalRow = new Adw.SwitchRow({
			title: _("Force Normal Urgency"),
			subtitle: _("Make all notifications use normal urgency level"),
		});
		this.settings.bind(
			"always-normal-urgency",
			forceNormalRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		timeoutGroup.add(forceNormalRow);

		const generalGroup = new Adw.PreferencesGroup({
			title: _("General Settings"),
			description: _("Basic notification configuration"),
		});
		generalPage.add(generalGroup);

		const positionRow = new Adw.ComboRow({
			title: _("Notification Position"),
			subtitle: _("Choose where notifications appear on screen"),
		});

		const positionModel = new Gtk.StringList();
		positionModel.append(_("Fill Screen"));
		positionModel.append(_("Left"));
		positionModel.append(_("Center"));
		positionModel.append(_("Right"));
		positionRow.set_model(positionModel);

		const currentPosition = this.settings.get_string("notification-position");
		const positionMap = { fill: 0, left: 1, center: 2, right: 3 };
		positionRow.set_selected(
			positionMap[currentPosition as keyof typeof positionMap] ?? 2,
		);

		positionRow.connect("notify::selected", () => {
			const selected = positionRow.get_selected();
			const positions = ["fill", "left", "center", "right"];
			this.settings.set_string("notification-position", positions[selected]);
		});

		generalGroup.add(positionRow);

		const fullscreenGroup = new Adw.PreferencesGroup({
			title: _("Fullscreen Notifications"),
			description: _("Control notification behavior in fullscreen mode"),
		});
		generalPage.add(fullscreenGroup);

		const enableFullscreenRow = new Adw.SwitchRow({
			title: _("Enable notifications in Fullscreen"),
			subtitle: _(
				"Show notifications even when applications are in fullscreen",
			),
		});
		this.settings.bind(
			"enable-fullscreen",
			enableFullscreenRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		fullscreenGroup.add(enableFullscreenRow);

		const filteringPage = new Adw.PreferencesPage({
			title: _("Filtering"),
			icon_name: "action-unavailable-symbolic",
		});
		window.add(filteringPage);

		this.addTestSection(filteringPage);

		const filterGroup = new Adw.PreferencesGroup({
			title: _("Notification Filters"),
			description: _(
				"Block or hide notifications using regular expressions to match title, body text, or application name",
			),
		});
		filteringPage.add(filterGroup);

		const enableFilteringRow = new Adw.SwitchRow({
			title: _("Enable Filtering"),
			subtitle: _("Apply notification filters"),
		});
		this.settings.bind(
			"enable-filtering",
			enableFilteringRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		filterGroup.add(enableFilteringRow);

		this.filtersGroup = new Adw.PreferencesGroup({
			title: _("Active Filters"),
			description: _(
				"Configure filters using RegExp patterns. Examples: '^Error' (starts with), 'update|upgrade' (contains either), '\\d+' (contains numbers)",
			),
		});
		filteringPage.add(this.filtersGroup);

		this.filtersList = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ["boxed-list"],
		});
		this.filtersGroup.add(this.filtersList);

		this.addFilterButton = new Gtk.Button({
			label: _("Add Filter"),
			css_classes: ["suggested-action"],
			margin_top: 6,
		});
		this.addFilterButton.connect("clicked", () => {
			this.addFilterEntry({
				title: "",
				body: "",
				appName: "",
				action: "hide",
			});
		});

		const addFilterGroup = new Adw.PreferencesGroup();
		addFilterGroup.add(this.addFilterButton);
		filteringPage.add(addFilterGroup);

		const filteringEnabled = this.settings.get_boolean("enable-filtering");
		this.filtersGroup.set_sensitive(filteringEnabled);
		addFilterGroup.set_sensitive(filteringEnabled);

		enableFilteringRow.connect("notify::active", () => {
			const enabled = enableFilteringRow.get_active();
			this.filtersGroup.set_sensitive(enabled);
			addFilterGroup.set_sensitive(enabled);

			let rowChild = this.filtersList.get_first_child();
			while (rowChild) {
				rowChild.set_sensitive(enabled);
				rowChild = rowChild.get_next_sibling();
			}
		});

		this.populateFiltersList();

		const themesPage = new Adw.PreferencesPage({
			title: _("Themes"),
			icon_name: "applications-graphics-symbolic",
		});
		window.add(themesPage);

		this.addTestSection(themesPage);

		const themeGroup = new Adw.PreferencesGroup({
			title: _("Notification Themes"),
			description: _("Customize notification appearance by application"),
		});
		themesPage.add(themeGroup);

		const enableColorsRow = new Adw.SwitchRow({
			title: _("Enable Custom Colors"),
			subtitle: _("Apply custom colors to notifications"),
		});
		this.settings.bind(
			"enable-custom-colors",
			enableColorsRow,
			"active",
			Gio.SettingsBindFlags.DEFAULT,
		);
		themeGroup.add(enableColorsRow);

		this.appThemesGroup = new Adw.PreferencesGroup({
			title: _("Application Themes"),
			description: _(
				"Set custom themes for specific applications using app names or RegExp patterns",
			),
		});
		themesPage.add(this.appThemesGroup);

		this.appThemesList = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ["boxed-list"],
		});
		this.appThemesGroup.add(this.appThemesList);

		this.addButton = new Gtk.Button({
			label: _("Add Application Theme"),
			css_classes: ["suggested-action"],
			margin_top: 6,
		});
		this.addButton.connect("clicked", () => {
			this.addAppThemeEntry("", { ...DEFAULT_THEME });
		});

		const addThemeGroup = new Adw.PreferencesGroup();
		addThemeGroup.add(this.addButton);
		themesPage.add(addThemeGroup);

		const themesEnabled = this.settings.get_boolean("enable-custom-colors");
		this.appThemesGroup.set_sensitive(themesEnabled);
		addThemeGroup.set_sensitive(themesEnabled);

		enableColorsRow.connect("notify::active", () => {
			const enabled = enableColorsRow.get_active();
			this.appThemesGroup.set_sensitive(enabled);
			addThemeGroup.set_sensitive(enabled);

			let rowChild = this.appThemesList.get_first_child();
			while (rowChild) {
				rowChild.set_sensitive(enabled);
				rowChild = rowChild.get_next_sibling();
			}
		});

		this.populateAppThemesList();

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
		let child = this.filtersList.get_first_child();
		while (child) {
			const next = child.get_next_sibling();
			this.filtersList.remove(child);
			child = next;
		}

		const filteringEnabled = this.settings.get_boolean("enable-filtering");
		for (let index = 0; index < this.filtersData.length; index++) {
			this.addFilterRow(index);
		}

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

		const filteringEnabled = this.settings.get_boolean("enable-filtering");
		const lastChild = this.filtersList.get_last_child();
		if (lastChild) {
			lastChild.set_sensitive(filteringEnabled);
		}
	}

	private addFilterRow(index: number) {
		const entry = this.filtersData[index];

		const mainBox = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			spacing: 12,
			margin_top: 12,
			margin_bottom: 12,
			margin_start: 12,
			margin_end: 12,
		});

		const headerRow = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 12,
		});

		const actionLabel = new Gtk.Label({
			label: _("Action:"),
			halign: Gtk.Align.START,
		});

		const actionCombo = new Gtk.ComboBoxText();
		actionCombo.append("hide", _("Hide notification"));
		actionCombo.append("close", _("Close notification"));
		actionCombo.set_active_id(entry.filter.action);

		actionCombo.connect("changed", () => {
			const activeId = actionCombo.get_active_id();
			if (activeId) {
				this.filtersData[index].filter.action = activeId as "hide" | "close";
				this.saveFiltersData();
			}
		});

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
		headerRow.append(removeButton);

		const fieldsGrid = new Gtk.Grid({
			column_spacing: 12,
			row_spacing: 6,
			margin_top: 6,
		});

		const titleLabel = new Gtk.Label({
			label: _("Title matches regex:"),
			halign: Gtk.Align.START,
		});
		fieldsGrid.attach(titleLabel, 0, 0, 1, 1);

		const titleEntry = new Gtk.Entry({
			text: entry.filter.title,
			placeholder_text: _("Match pattern (RegExp)"),
			hexpand: true,
		});
		titleEntry.connect("changed", () => {
			const pattern = titleEntry.get_text();
			this.filtersData[index].filter.title = pattern;
			this.validateRegexEntry(titleEntry, pattern);
			this.saveFiltersData();
		});
		this.validateRegexEntry(titleEntry, entry.filter.title);
		fieldsGrid.attach(titleEntry, 1, 0, 1, 1);

		const bodyLabel = new Gtk.Label({
			label: _("Body matches regex:"),
			halign: Gtk.Align.START,
		});
		fieldsGrid.attach(bodyLabel, 0, 1, 1, 1);

		const bodyEntry = new Gtk.Entry({
			text: entry.filter.body,
			placeholder_text: _("Match pattern (RegExp)"),
			hexpand: true,
		});
		bodyEntry.connect("changed", () => {
			const pattern = bodyEntry.get_text();
			this.filtersData[index].filter.body = pattern;
			this.validateRegexEntry(bodyEntry, pattern);
			this.saveFiltersData();
		});
		this.validateRegexEntry(bodyEntry, entry.filter.body);
		fieldsGrid.attach(bodyEntry, 1, 1, 1, 1);

		const appNameLabel = new Gtk.Label({
			label: _("App name matches regex:"),
			halign: Gtk.Align.START,
		});
		fieldsGrid.attach(appNameLabel, 0, 2, 1, 1);

		const appNameEntry = new Gtk.Entry({
			text: entry.filter.appName,
			placeholder_text: _("Match pattern (RegExp)"),
			hexpand: true,
		});
		appNameEntry.connect("changed", () => {
			const pattern = appNameEntry.get_text();
			this.filtersData[index].filter.appName = pattern;
			this.validateRegexEntry(appNameEntry, pattern);
			this.saveFiltersData();
		});
		this.validateRegexEntry(appNameEntry, entry.filter.appName);
		fieldsGrid.attach(appNameEntry, 1, 2, 1, 1);

		mainBox.append(headerRow);
		mainBox.append(fieldsGrid);

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

	private validateRegexEntry(entry: Gtk.Entry, pattern: string) {
		if (!pattern?.trim()) {
			entry.remove_css_class("error");
			entry.set_tooltip_text("");
			return;
		}

		try {
			new RegExp(pattern, "i");
			entry.remove_css_class("error");
			entry.set_tooltip_text("");
		} catch (error) {
			entry.add_css_class("error");
			entry.set_tooltip_text(`Invalid regex pattern: ${error}`);
		}
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
					list[entry.name] = {
						...DEFAULT_THEME,
						...entry.theme,
					};
				}
				return list;
			},
			{} as Record<string, NotificationTheme>,
		);

		this.settings.set_string("app-themes", JSON.stringify(themes));
	}

	private populateAppThemesList() {
		let child = this.appThemesList.get_first_child();
		while (child) {
			const next = child.get_next_sibling();
			this.appThemesList.remove(child);
			child = next;
		}

		for (let index = 0; index < this.appThemesData.length; index++) {
			this.addAppThemeRow(index);
		}

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

		const mainBox = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			spacing: 12,
			margin_top: 12,
			margin_bottom: 12,
			margin_start: 12,
			margin_end: 12,
		});

		const headerRow = new Gtk.Box({
			orientation: Gtk.Orientation.HORIZONTAL,
			spacing: 12,
		});

		const nameEntry = new Gtk.Entry({
			text: entry.name,
			placeholder_text: _("Match pattern (RegExp)"),
			hexpand: true,
		});

		nameEntry.connect("changed", () => {
			const pattern = nameEntry.get_text();
			this.appThemesData[index].name = pattern;
			this.validateRegexEntry(nameEntry, pattern);
			this.saveAppThemesData();
		});
		this.validateRegexEntry(nameEntry, entry.name);

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

		const themeGrid = new Gtk.Grid({
			column_spacing: 12,
			row_spacing: 6,
			margin_top: 6,
		});

		const themeEntries = [
			{
				key: "backgroundColor",
				label: _("Background"),
				colorKey: "backgroundColor",
				fontKey: null,
			},
			{
				key: "titleColor",
				label: _("Title"),
				colorKey: "titleColor",
				fontKey: "titleFontSize",
			},
			{
				key: "bodyColor",
				label: _("Body Text"),
				colorKey: "bodyColor",
				fontKey: "bodyFontSize",
			},
			{
				key: "appNameColor",
				label: _("App Name"),
				colorKey: "appNameColor",
				fontKey: "appNameFontSize",
			},
			{
				key: "timeColor",
				label: _("Time"),
				colorKey: "timeColor",
				fontKey: "timeFontSize",
			},
		] as const;

		themeEntries.forEach((themeEntry, themeIndex) => {
			const row = themeIndex;

			const label = new Gtk.Label({
				label: themeEntry.label,
				halign: Gtk.Align.START,
				css_classes: ["caption"],
			});
			themeGrid.attach(label, 0, row, 1, 1);

			const colorButton = new Gtk.ColorButton({
				use_alpha: false,
				halign: Gtk.Align.START,
			});

			const [red, green, blue, alpha] = entry.theme[themeEntry.colorKey];
			colorButton.set_rgba(new Gdk.RGBA({ red, green, blue, alpha }));

			colorButton.connect("color-set", () => {
				const color = colorButton.get_rgba();
				this.appThemesData[index].theme[themeEntry.colorKey] = [
					color.red,
					color.green,
					color.blue,
					color.alpha,
				];
				this.saveAppThemesData();
			});

			themeGrid.attach(colorButton, 1, row, 1, 1);

			if (themeEntry.fontKey) {
				const fontSizeValue =
					entry.theme[themeEntry.fontKey] ?? DEFAULT_THEME[themeEntry.fontKey];

				const fontSizeButton = new Gtk.SpinButton({
					adjustment: new Gtk.Adjustment({
						lower: 8,
						upper: 32,
						step_increment: 1,
						page_increment: 2,
					}),
					value: fontSizeValue,
					halign: Gtk.Align.START,
				});

				fontSizeButton.connect("value-changed", () => {
					this.appThemesData[index].theme[themeEntry.fontKey] =
						fontSizeButton.get_value();
					this.saveAppThemesData();
				});

				themeGrid.attach(fontSizeButton, 2, row, 1, 1);

				const fontLabel = new Gtk.Label({
					label: _("px"),
					halign: Gtk.Align.START,
					css_classes: ["caption"],
				});
				themeGrid.attach(fontLabel, 3, row, 1, 1);
			} else {
				// Add empty space for background row to maintain alignment
				const emptySpace = new Gtk.Label({
					label: "",
					halign: Gtk.Align.START,
				});
				themeGrid.attach(emptySpace, 2, row, 2, 1);
			}
		});

		mainBox.append(headerRow);
		mainBox.append(themeGrid);

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

	private addTestSection(page: Adw.PreferencesPage) {
		const testGroup = new Adw.PreferencesGroup({
			title: _("Test Notifications"),
		});
		page.add(testGroup);

		const testList = new Gtk.ListBox({
			selection_mode: Gtk.SelectionMode.NONE,
			css_classes: ["boxed-list"],
		});
		testGroup.add(testList);

		const mainBox = new Gtk.Box({
			orientation: Gtk.Orientation.VERTICAL,
			spacing: 12,
			margin_top: 12,
			margin_bottom: 12,
			margin_start: 12,
			margin_end: 12,
		});

		const testGrid = new Gtk.Grid({
			column_spacing: 12,
			row_spacing: 6,
		});

		const appLabel = new Gtk.Label({
			label: _("App Name:"),
			halign: Gtk.Align.START,
		});
		testGrid.attach(appLabel, 0, 0, 1, 1);

		const appEntry = new Gtk.Entry({
			text: _("Test Application Name"),
			placeholder_text: _("Application name"),
			hexpand: true,
		});
		testGrid.attach(appEntry, 1, 0, 1, 1);

		const titleLabel = new Gtk.Label({
			label: _("Title:"),
			halign: Gtk.Align.START,
		});
		testGrid.attach(titleLabel, 0, 1, 1, 1);

		const titleEntry = new Gtk.Entry({
			text: _("Test Notification Title"),
			placeholder_text: _("Notification title"),
			hexpand: true,
		});
		testGrid.attach(titleEntry, 1, 1, 1, 1);

		const bodyLabel = new Gtk.Label({
			label: _("Body:"),
			halign: Gtk.Align.START,
		});
		testGrid.attach(bodyLabel, 0, 2, 1, 1);

		const bodyEntry = new Gtk.Entry({
			text: _("Test Notification Body"),
			placeholder_text: _("Notification body text"),
			hexpand: true,
		});
		testGrid.attach(bodyEntry, 1, 2, 1, 1);

		mainBox.append(testGrid);

		const listBoxRow = new Gtk.ListBoxRow({
			child: mainBox,
			activatable: false,
			selectable: false,
		});

		testList.append(listBoxRow);

		const testButton = new Gtk.Button({
			label: _("Send Test Notification"),
			css_classes: ["suggested-action"],
			margin_top: 6,
		});

		testButton.connect("clicked", () => {
			const appName = appEntry.get_text() || _("Test App");
			const title = titleEntry.get_text() || _("Test Notification");
			const body = bodyEntry.get_text() || _("This is a test notification");
			this.sendNotification(appName, title, body);
		});

		const testButtonGroup = new Adw.PreferencesGroup();
		testButtonGroup.add(testButton);
		page.add(testButtonGroup);
	}
}
