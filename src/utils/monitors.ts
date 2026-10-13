import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { TypedEventEmitter } from "./event-emitter.js";
import type { MonitorSelection } from "./normalize.js";

const DISPLAY_CONFIG = "org.gnome.Mutter.DisplayConfig";
const DISPLAY_CONFIG_PATH = "/org/gnome/Mutter/DisplayConfig";
const CURRENT_STATE_TYPE =
  "(ua((ssss)a(siiddada{sv})a{sv})a(iiduba(ssss)a{sv})a{sv})";

export type ConnectedMonitor = {
  selection: MonitorSelection;
  name: string;
  active: boolean;
};

export function findMonitor(
  monitors: readonly ConnectedMonitor[],
  selection: MonitorSelection,
): ConnectedMonitor | undefined {
  if (!selection.connector) return undefined;

  const matches = monitors.filter(
    (monitor) =>
      monitor.selection.vendor === selection.vendor &&
      monitor.selection.product === selection.product &&
      monitor.selection.serial === selection.serial,
  );
  const connected = matches.find(
    (monitor) => monitor.selection.connector === selection.connector,
  );
  if (connected) return connected;

  const hasSerial =
    selection.serial.trim() !== "" &&
    !/^(?:0+|0x0+|unknown)$/i.test(selection.serial.trim());
  return hasSerial && matches.length === 1 ? matches[0] : undefined;
}

function readMonitors(state: GLib.Variant): ConnectedMonitor[] {
  const activeConnectors = new Set<string>();
  const logicalMonitors = state.get_child_value(2);
  for (let index = 0; index < logicalMonitors.n_children(); index++) {
    const specifications = logicalMonitors
      .get_child_value(index)
      .get_child_value(5);
    for (let position = 0; position < specifications.n_children(); position++) {
      activeConnectors.add(
        specifications
          .get_child_value(position)
          .get_child_value(0)
          .get_string()[0],
      );
    }
  }

  const monitors: ConnectedMonitor[] = [];
  const physicalMonitors = state.get_child_value(1);
  for (let index = 0; index < physicalMonitors.n_children(); index++) {
    const monitor = physicalMonitors.get_child_value(index);
    const specification = monitor.get_child_value(0);
    const connector = specification.get_child_value(0).get_string()[0];
    const vendor = specification.get_child_value(1).get_string()[0];
    const product = specification.get_child_value(2).get_string()[0];
    const serial = specification.get_child_value(3).get_string()[0];
    const name = monitor
      .get_child_value(2)
      .lookup_value("display-name", new GLib.VariantType("s"))
      ?.get_string()[0];
    monitors.push({
      selection: { connector, vendor, product, serial },
      name: name || product || connector,
      active: activeConnectors.has(connector),
    });
  }
  return monitors;
}

export class MonitorManager {
  readonly events = new TypedEventEmitter<{ changed: [] }>();
  monitors: readonly ConnectedMonitor[] = [];
  loading = false;

  private connection = Gio.DBus.session;
  private cancellable?: Gio.Cancellable;
  private subscription: number;
  private disposed = false;

  constructor() {
    this.subscription = this.connection.signal_subscribe(
      DISPLAY_CONFIG,
      DISPLAY_CONFIG,
      "MonitorsChanged",
      DISPLAY_CONFIG_PATH,
      null,
      Gio.DBusSignalFlags.NONE,
      () => this.refresh(),
    );
    this.refresh();
  }

  refresh() {
    if (this.disposed) return;
    this.cancellable?.cancel();
    const cancellable = new Gio.Cancellable();
    this.cancellable = cancellable;
    this.loading = true;

    this.connection.call(
      DISPLAY_CONFIG,
      DISPLAY_CONFIG_PATH,
      DISPLAY_CONFIG,
      "GetCurrentState",
      null,
      null,
      Gio.DBusCallFlags.NONE,
      5000,
      cancellable,
      (_connection, result) => {
        try {
          const state = this.connection.call_finish(result);
          if (cancellable.is_cancelled()) return;
          if (state.get_type_string() !== CURRENT_STATE_TYPE) {
            throw new Error("Unexpected display configuration response");
          }
          this.monitors = readMonitors(state);
        } catch (error) {
          if (cancellable.is_cancelled()) return;
          this.monitors = [];
          console.error(
            "Notification Configurator: unable to read monitors",
            error,
          );
        }
        this.loading = false;
        this.events.emit("changed");
      },
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancellable?.cancel();
    this.loading = false;
    this.connection.signal_unsubscribe(this.subscription);
  }
}
