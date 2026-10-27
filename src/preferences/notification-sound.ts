import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type { Configuration } from "../utils/settings.js";

export function createSoundPicker(
  sound: Configuration["sound"],
  onSave: () => void,
): Adw.ActionRow {
  const row = new Adw.ActionRow({ title: _("Sound"), use_markup: false });
  const chooseButton = new Gtk.Button({
    label: _("Choose Sound…"),
    valign: Gtk.Align.CENTER,
  });
  const resetButton = new Gtk.Button({
    icon_name: "edit-undo-symbolic",
    tooltip_text: _("Use Default Theme Sound"),
    valign: Gtk.Align.CENTER,
  });
  const update = () => {
    row.set_subtitle(
      sound.file
        ? GLib.path_get_basename(sound.file)
        : _("Default theme sound"),
    );
    row.set_tooltip_text(sound.file || _("Default theme sound"));
    resetButton.set_visible(sound.file !== "");
  };
  resetButton.connect("clicked", () => {
    sound.file = "";
    update();
    onSave();
  });
  chooseButton.connect("clicked", () => {
    const parent = row.get_root();
    if (!(parent instanceof Gtk.Window)) return;
    const chooser = new Gtk.FileChooserDialog({
      title: _("Choose Notification Sound"),
      transient_for: parent,
      modal: true,
      destroy_with_parent: true,
      action: Gtk.FileChooserAction.OPEN,
    });
    chooser.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
    chooser.add_button(_("Open"), Gtk.ResponseType.ACCEPT);
    chooser.set_default_response(Gtk.ResponseType.ACCEPT);
    const filter = new Gtk.FileFilter({ name: _("Ogg and WAV audio files") });
    filter.add_mime_type("audio/ogg");
    filter.add_mime_type("audio/x-wav");
    for (const extension of ["ogg", "oga", "wav"]) {
      filter.add_pattern(`*.${extension}`);
    }
    chooser.add_filter(filter);
    try {
      if (sound.file) chooser.set_file(Gio.File.new_for_path(sound.file));
      else
        chooser.set_current_folder(Gio.File.new_for_path("/usr/share/sounds"));
    } catch {
      chooser.set_current_folder(Gio.File.new_for_path(GLib.get_home_dir()));
    }
    chooser.connect("response", (_chooser, response) => {
      const file = chooser.get_file();
      chooser.destroy();
      if (response !== Gtk.ResponseType.ACCEPT || !file) return;
      const path = file.get_path();
      if (!path) {
        const dialog = new Adw.MessageDialog({
          transient_for: parent,
          modal: true,
          heading: _("Choose a local audio file"),
          body: _("Notification sounds must be stored on this computer."),
        });
        dialog.add_response("close", _("Close"));
        dialog.present();
        return;
      }
      sound.file = path;
      update();
      onSave();
    });
    chooser.present();
  });
  row.add_suffix(resetButton);
  row.add_suffix(chooseButton);
  row.set_activatable_widget(chooseButton);
  update();
  return row;
}
