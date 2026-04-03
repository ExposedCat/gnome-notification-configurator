#!/usr/bin/env python3
import sys
import gi

gi.require_version("Gtk", "4.0")
from gi.repository import Gtk, GLib


DELAY_MS = 350      # wait after losing focus before asking again
RETRY_MS = 1200     # keep asking while unfocused


class AttentionStarver(Gtk.Application):
    def __init__(self):
        super().__init__(application_id="com.example.AttentionStarver")
        self.win = None
        self.status = None
        self.arm_id = 0
        self.retry_id = 0

    def do_activate(self):
        if self.win is None:
            self.win = Gtk.ApplicationWindow(application=self)
            self.win.set_title("Attention Starver")
            self.win.set_default_size(420, 140)

            box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
            box.set_margin_top(18)
            box.set_margin_bottom(18)
            box.set_margin_start(18)
            box.set_margin_end(18)

            info = Gtk.Label(
                label="Switch to another window.\nThis one will keep asking GNOME to present it again."
            )
            self.status = Gtk.Label(label="active")

            box.append(info)
            box.append(self.status)
            self.win.set_child(box)

            self.win.connect("notify::is-active", self.on_active_changed)
            self.win.connect("close-request", self.on_close)

        self.win.present()

    def on_active_changed(self, win, _pspec):
        active = win.is_active()

        if active:
            self.status.set_text("active")
            self.clear_timers()
            return

        self.status.set_text("inactive -> requesting attention")
        self.clear_timers()

        # first poke shortly after focus loss
        self.arm_id = GLib.timeout_add(DELAY_MS, self.request_once)

        # then keep poking while unfocused
        self.retry_id = GLib.timeout_add(RETRY_MS, self.request_repeat)

    def request_once(self):
        self.arm_id = 0
        if self.win is not None and not self.win.is_active():
            self.win.present()
        return False

    def request_repeat(self):
        if self.win is None or self.win.is_active():
            self.retry_id = 0
            return False

        self.win.present()
        return True

    def clear_timers(self):
        if self.arm_id:
            GLib.source_remove(self.arm_id)
            self.arm_id = 0
        if self.retry_id:
            GLib.source_remove(self.retry_id)
            self.retry_id = 0

    def on_close(self, *_args):
        self.clear_timers()
        self.quit()
        return False


if __name__ == "__main__":
    app = AttentionStarver()
    raise SystemExit(app.run(sys.argv))