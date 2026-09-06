import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { SettingsManager } from "../utils/settings.js";
import type { ConfigurationImport, ImportEntry } from "../utils/sync.js";
import {
  createImportEntry,
  mergeConfiguration,
  parseConfigurationImport,
} from "../utils/sync.js";
import { configurationLabels } from "./labels.js";

export function buildSyncPage(
  window: Adw.PreferencesWindow,
  settings: Gio.Settings,
  onImported: () => void,
): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: _("Sync"),
    icon_name: "view-refresh-symbolic",
  });
  const group = new Adw.PreferencesGroup({
    description: _(
      "Export your settings or import selected settings from a configuration file.",
    ),
  });
  page.add(group);
  const cancellable = new Gio.Cancellable();
  window.connect("close-request", () => cancellable.cancel());

  const showError = (error: unknown) => {
    if (cancellable.is_cancelled()) return;
    const dialog = new Adw.MessageDialog({
      transient_for: window,
      modal: true,
      heading: _("Configuration could not be transferred"),
      body: error instanceof Error ? error.message : String(error),
    });
    dialog.add_response("close", _("Close"));
    dialog.present();
  };

  for (const exporting of [true, false]) {
    const title = exporting
      ? _("Export configuration")
      : _("Import configuration");
    const row = new Adw.ActionRow({ title, activatable: true });
    row.add_suffix(
      new Gtk.Image({
        icon_name: exporting
          ? "document-save-symbolic"
          : "document-open-symbolic",
      }),
    );
    group.add(row);
    row.connect("activated", () => {
      const transfer = (file: Gio.File) => {
        try {
          if (cancellable.is_cancelled()) return;
          group.set_sensitive(false);
          if (exporting) {
            const contents = JSON.stringify(
              {
                version: 1,
                global: SettingsManager.parseGlobalConfiguration(
                  settings.get_string("global"),
                ),
                patterns: SettingsManager.parsePatternConfigurations(
                  settings.get_string("patterns"),
                ),
              },
              null,
              2,
            );
            file.replace_contents_bytes_async(
              new GLib.Bytes(new TextEncoder().encode(`${contents}\n`)),
              null,
              false,
              Gio.FileCreateFlags.PRIVATE |
                Gio.FileCreateFlags.REPLACE_DESTINATION,
              cancellable,
              (_file, saved) => {
                group.set_sensitive(true);
                try {
                  file.replace_contents_finish(saved);
                  if (!cancellable.is_cancelled())
                    window.add_toast(
                      new Adw.Toast({ title: _("Configuration exported") }),
                    );
                } catch (error) {
                  showError(error);
                }
              },
            );
          } else {
            file.load_contents_async(cancellable, (_file, loaded) => {
              group.set_sensitive(true);
              try {
                const [success, contents] = file.load_contents_finish(loaded);
                if (!success)
                  throw new Error(_("Could not read the configuration file."));
                if (!cancellable.is_cancelled())
                  showImportDialog(
                    window,
                    settings,
                    parseConfigurationImport(
                      new TextDecoder("utf-8", { fatal: true }).decode(
                        contents,
                      ),
                    ),
                    onImported,
                    showError,
                  );
              } catch (error) {
                showError(error);
              }
            });
          }
        } catch (error) {
          group.set_sensitive(true);
          showError(error);
        }
      };
      try {
        const chooser = new Gtk.FileChooserDialog({
          title,
          transient_for: window,
          modal: true,
          destroy_with_parent: true,
          action: exporting
            ? Gtk.FileChooserAction.SAVE
            : Gtk.FileChooserAction.OPEN,
        });
        chooser.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
        chooser.add_button(
          exporting ? _("Save") : _("Open"),
          Gtk.ResponseType.ACCEPT,
        );
        chooser.set_default_response(Gtk.ResponseType.ACCEPT);
        const filter = new Gtk.FileFilter({
          name: _("Configuration files (*.json)"),
        });
        filter.add_pattern("*.json");
        chooser.add_filter(filter);
        if (exporting)
          chooser.set_current_name("notification-configurator.json");
        chooser.connect("response", (_chooser, response) => {
          try {
            const file =
              response === Gtk.ResponseType.ACCEPT ? chooser.get_file() : null;
            chooser.destroy();
            group.set_sensitive(true);
            if (file) transfer(file);
          } catch (error) {
            chooser.destroy();
            group.set_sensitive(true);
            showError(error);
          }
        });
        group.set_sensitive(false);
        chooser.present();
      } catch (error) {
        group.set_sensitive(true);
        showError(error);
      }
    });
  }
  return page;
}

function showImportDialog(
  window: Adw.PreferencesWindow,
  settings: Gio.Settings,
  configuration: ConfigurationImport,
  onImported: () => void,
  showError: (error: unknown) => void,
) {
  const previousGlobal = settings.get_string("global");
  const previousPatterns = settings.get_string("patterns");
  const global = SettingsManager.parseGlobalConfiguration(previousGlobal);
  const patterns = SettingsManager.parsePatternConfigurations(previousPatterns);
  const entries: ImportEntry[] = [];
  if (configuration.global)
    entries.push(
      createImportEntry(
        _("Global"),
        global,
        configuration.global,
        SettingsManager.defaultGlobalConfiguration(),
        null,
      ),
    );
  const matchedIndexes = new Set<number>();
  for (const incoming of configuration.patterns) {
    const pattern = mergeConfiguration(
      SettingsManager.defaultPatternConfiguration(),
      incoming,
    );
    const index = patterns.findIndex(
      (existing, existingIndex) =>
        !matchedIndexes.has(existingIndex) &&
        existing.matcher.appName === pattern.matcher.appName &&
        existing.matcher.title === pattern.matcher.title &&
        existing.matcher.body === pattern.matcher.body,
    );
    if (index >= 0) matchedIndexes.add(index);
    entries.push(
      createImportEntry(
        pattern.shortName || _("Unnamed Pattern"),
        patterns[index] ?? SettingsManager.defaultPatternConfiguration(),
        incoming,
        SettingsManager.defaultPatternConfiguration(),
        index,
      ),
    );
  }
  const dialog = new Adw.MessageDialog({
    transient_for: window,
    modal: true,
    heading: _("Import configuration"),
    body: _(
      "Select what to import. Expand conflicts to choose which existing settings to replace.",
    ),
  });
  dialog.add_response("cancel", _("Cancel"));
  dialog.add_response("import", _("Import"));
  dialog.set_response_appearance("import", Adw.ResponseAppearance.SUGGESTED);
  dialog.set_close_response("cancel");
  const entryCards = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 18,
    margin_top: 3,
    margin_bottom: 3,
    margin_start: 3,
    margin_end: 3,
  });
  const labels = configurationLabels();
  for (const entry of entries) {
    const checkbox = new Gtk.CheckButton({
      active: true,
      valign: Gtk.Align.CENTER,
      tooltip_text: `${_("Import")}: ${entry.title}`,
    });
    const subtitle =
      entry.patternIndex === null
        ? _("Import global settings")
        : entry.patternIndex >= 0
          ? _("Matches an existing pattern")
          : _("Add as a new pattern");
    const matchers = [
      [_("App Name"), entry.incoming.get("matcher.appName")],
      [_("Title"), entry.incoming.get("matcher.title")],
      [_("Body"), entry.incoming.get("matcher.body")],
    ]
      .filter(
        ([, matcher]) => typeof matcher === "string" && matcher.length > 0,
      )
      .map(([label, matcher]) => `${label}: ${matcher}`);
    const row = new Adw.ExpanderRow({
      title: entry.title,
      subtitle: [subtitle, ...matchers].join(" · "),
      use_markup: false,
      enable_expansion: entry.conflicts.size > 0,
    });
    row.add_prefix(checkbox);
    for (const [path, current] of entry.conflicts) {
      const conflict = new Adw.ActionRow({
        title: labels.get(path) ?? _("Setting"),
        subtitle: `${JSON.stringify(current)} → ${JSON.stringify(entry.incoming.get(path))}`,
        use_markup: false,
        subtitle_lines: 2,
      });
      const replace = new Gtk.CheckButton({
        active: true,
        valign: Gtk.Align.CENTER,
      });
      replace.connect("toggled", () => {
        if (replace.get_active()) entry.excluded.delete(path);
        else entry.excluded.add(path);
      });
      conflict.add_prefix(replace);
      conflict.set_activatable_widget(replace);
      row.add_row(conflict);
    }
    checkbox.connect("toggled", () => {
      entry.selected = checkbox.get_active();
      row.set_enable_expansion(entry.selected && entry.conflicts.size > 0);
      dialog.set_response_enabled(
        "import",
        entries.some((candidate) => candidate.selected),
      );
    });
    const card = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.NONE,
      css_classes: ["boxed-list"],
    });
    card.append(row);
    entryCards.append(card);
  }
  dialog.set_response_enabled("import", entries.length > 0);
  dialog.set_extra_child(
    new Gtk.ScrolledWindow({
      child: entryCards,
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      min_content_height: 180,
      max_content_height: 420,
      propagate_natural_height: true,
    }),
  );
  dialog.connect("response", (_dialog, response) => {
    if (response !== "import") return;
    try {
      if (
        settings.get_string("global") !== previousGlobal ||
        settings.get_string("patterns") !== previousPatterns
      ) {
        throw new Error(
          _(
            "Settings changed while the import was open. Select the file again to review the latest conflicts.",
          ),
        );
      }
      const selected = entries.filter((entry) => entry.selected);
      const importedGlobal = selected.find(
        (entry) => entry.patternIndex === null,
      );
      for (const entry of selected) {
        if (entry.patternIndex === null) continue;
        const current =
          patterns[entry.patternIndex] ??
          SettingsManager.defaultPatternConfiguration();
        const merged = mergeConfiguration(
          current,
          entry.incoming,
          entry.excluded,
        );
        if (entry.patternIndex >= 0) patterns[entry.patternIndex] = merged;
        else patterns.push(merged);
      }
      const pending = new Gio.Settings({
        settings_schema: settings.settings_schema,
        path: settings.path,
      });
      pending.delay();
      if (
        importedGlobal &&
        !pending.set_string(
          "global",
          JSON.stringify(
            mergeConfiguration(
              global,
              importedGlobal.incoming,
              importedGlobal.excluded,
            ),
          ),
        )
      ) {
        pending.revert();
        throw new Error(_("Global settings could not be saved."));
      }
      if (
        selected.some((entry) => entry.patternIndex !== null) &&
        !pending.set_string("patterns", JSON.stringify(patterns))
      ) {
        pending.revert();
        throw new Error(_("Patterns could not be saved."));
      }
      pending.apply();
      onImported();
      window.add_toast(new Adw.Toast({ title: _("Configuration imported") }));
    } catch (error) {
      showError(error);
    }
  });
  dialog.present();
}
