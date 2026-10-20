import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type {
  GlobalConfiguration,
  MediaPlayerConfiguration,
} from "../utils/settings.js";
import { mediaPlayerPreview } from "./media-preview.js";
import { createSvgPreview } from "./preview.js";

export function buildNotificationCenterPage(
  configuration: () => GlobalConfiguration,
  save: () => void,
): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: _("Notification Center"),
    icon_name: "preferences-system-notifications-symbolic",
  });
  const group = new Adw.PreferencesGroup({ title: _("Media Player") });
  page.add(group);
  const preview = createSvgPreview(_("Media player appearance preview"));
  group.add(preview.row);
  const desktop = new Gio.Settings({
    schema_id: "org.gnome.desktop.interface",
  });
  const rows: Gtk.Widget[] = [];
  const sourcePattern = new Adw.EntryRow({
    title: _("Source Title Pattern (optional)"),
    tooltip_text: _(
      "Case-insensitive regular expression matching the source app title. Empty hides all sources.",
    ),
    text: configuration().mediaPlayer.sourceRegex,
  });
  const refresh = () => {
    const mediaPlayer = configuration().mediaPlayer;
    preview.update(mediaPlayerPreview(mediaPlayer, preview.picture, desktop));
    for (const row of rows) row.set_sensitive(mediaPlayer.enabled);
    sourcePattern.set_visible(mediaPlayer.source === "hide");
  };
  const enabled = new Adw.SwitchRow({
    title: _("Enabled"),
    subtitle: _("Show media players in the notification center"),
    active: configuration().mediaPlayer.enabled,
  });
  enabled.connect("notify::active", () => {
    configuration().mediaPlayer.enabled = enabled.active;
    save();
    refresh();
  });
  group.add(enabled);
  const enlarge = new Adw.SwitchRow({
    title: _("Enlarge"),
    subtitle: _("Use a taller banner and larger track text"),
    active: configuration().mediaPlayer.enlarge,
  });
  enlarge.connect("notify::active", () => {
    configuration().mediaPlayer.enlarge = enlarge.active;
    save();
    refresh();
  });
  group.add(enlarge);
  rows.push(enlarge);
  const addChoices = <Key extends "background" | "thumbnail" | "source">(
    key: Key,
    title: string,
    subtitle: string,
    choices: readonly MediaPlayerConfiguration[Key][],
    labels: string[],
  ) => {
    const row = new Adw.ComboRow({
      title,
      subtitle,
      model: Gtk.StringList.new(labels),
      selected: choices.indexOf(configuration().mediaPlayer[key]),
    });
    row.connect("notify::selected", () => {
      const selected = choices[row.selected];
      if (selected === undefined) return;
      configuration().mediaPlayer[key] = selected;
      save();
      refresh();
    });
    group.add(row);
    rows.push(row);
  };
  addChoices(
    "background",
    _("Background"),
    _("Artwork behind the track and playback controls"),
    ["empty", "thumbnail", "blurred"],
    [_("Empty"), _("Thumbnail"), _("Blurred")],
  );
  addChoices(
    "thumbnail",
    _("Thumbnail"),
    _("Rounded artwork beside the track"),
    ["small", "big", "hide"],
    [_("Small"), _("Big"), _("Hide")],
  );
  addChoices(
    "source",
    _("Source"),
    _("App name and icon above the track"),
    ["show", "hide"],
    [_("Show"), _("Hide")],
  );
  sourcePattern.connect("changed", () => {
    try {
      new RegExp(sourcePattern.text, "i");
      sourcePattern.remove_css_class("error");
      configuration().mediaPlayer.sourceRegex = sourcePattern.text;
      save();
      refresh();
    } catch {
      sourcePattern.add_css_class("error");
    }
  });
  group.add(sourcePattern);
  rows.push(sourcePattern);
  refresh();
  return page;
}
