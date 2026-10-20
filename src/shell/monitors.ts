import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { type ConnectedMonitor, findMonitor } from "../utils/monitors.js";
import type { MonitorSelection } from "../utils/normalize.js";

export function getPanelMonitor() {
  return (
    Main.layoutManager.findMonitorForActor(Main.layoutManager.panelBox) ??
    Main.layoutManager.primaryMonitor
  );
}

export function resolveNotificationMonitor(
  monitors: readonly ConnectedMonitor[],
  selection: MonitorSelection,
) {
  if (!selection.connector) return getPanelMonitor();

  const connected = findMonitor(monitors, selection);
  if (!connected?.active) return Main.layoutManager.primaryMonitor;

  const index = global.backend
    .get_monitor_manager()
    .get_monitor_for_connector(connected.selection.connector);
  return (
    Main.layoutManager.monitors[index] ?? Main.layoutManager.primaryMonitor
  );
}
