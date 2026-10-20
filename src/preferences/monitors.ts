import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import { type MonitorManager, findMonitor } from "../utils/monitors.js";
import { normalizeMonitor } from "../utils/normalize.js";
import type { Configuration, MonitorSelection } from "../utils/settings.js";

export function createMonitorRow(
  monitors: MonitorManager,
  configuration: Configuration,
  onSave: () => void,
): Adw.ComboRow {
  const row = new Adw.ComboRow({
    title: _("Monitor"),
    subtitle: _(
      "Use the main monitor when the selected monitor is unavailable",
    ),
  });
  let selections: MonitorSelection[] = [];
  let updating = false;
  let listener: number | undefined;

  const rebuild = () => {
    const model = new Gtk.StringList();
    model.append(_("Top bar monitor"));
    selections = [normalizeMonitor(undefined)];
    const selected = configuration.display.monitor;
    const matching = findMonitor(monitors.monitors, selected);
    let selectedIndex = 0;
    for (const monitor of monitors.monitors) {
      const label = `${monitor.name} (${monitor.selection.connector})`;
      model.append(
        monitor.active
          ? label
          : `${label} — ${_("Unavailable — using main monitor")}`,
      );
      selections.push(monitor.selection);
      if (monitor === matching) selectedIndex = selections.length - 1;
    }
    if (selected.connector && !matching) {
      model.append(
        `${selected.product || selected.connector} — ${_("Unavailable — using main monitor")}`,
      );
      selections.push(selected);
      selectedIndex = selections.length - 1;
    }

    updating = true;
    try {
      row.set_model(model);
      row.set_selected(selectedIndex);
    } finally {
      updating = false;
    }
  };

  row.connect("notify::selected", () => {
    if (updating) return;
    const selection = selections[row.get_selected()];
    if (!selection) return;
    configuration.display.monitor = { ...selection };
    onSave();
  });
  row.connect("realize", () => {
    listener = monitors.events.on("changed", rebuild);
    rebuild();
  });
  row.connect("unrealize", () => {
    if (listener !== undefined) monitors.events.off(listener);
    listener = undefined;
  });
  rebuild();
  return row;
}
