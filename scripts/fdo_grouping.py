#!/usr/bin/env python3
import argparse
import os
import sys
import time
from dataclasses import dataclass

import gi

gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")

from gi.repository import Gio, GLib


URGENCY = {
    "low": 0,
    "normal": 1,
    "critical": 2,
}


@dataclass(slots=True)
class NotificationSpec:
    app_name: str
    summary: str
    body: str
    app_icon: str
    desktop_entry: str | None
    expire_timeout: int
    resident: bool
    transient: bool
    urgency: str

    def build_hints(self) -> dict[str, GLib.Variant]:
        hints: dict[str, GLib.Variant] = {
            "urgency": GLib.Variant("y", URGENCY[self.urgency]),
            "resident": GLib.Variant("b", self.resident),
            "transient": GLib.Variant("b", self.transient),
        }

        if self.desktop_entry:
            hints["desktop-entry"] = GLib.Variant("s", self.desktop_entry)

        return hints


class NotificationClient:
    def __init__(self) -> None:
        self.bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)

    def notify(self, spec: NotificationSpec, replaces_id: int) -> int:
        reply = self.bus.call_sync(
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            "org.freedesktop.Notifications",
            "Notify",
            GLib.Variant(
                "(susssasa{sv}i)",
                (
                    spec.app_name,
                    replaces_id,
                    spec.app_icon,
                    spec.summary,
                    spec.body,
                    [],
                    spec.build_hints(),
                    spec.expire_timeout,
                ),
            ),
            GLib.VariantType.new("(u)"),
            Gio.DBusCallFlags.NONE,
            -1,
            None,
        )
        return int(reply.unpack()[0])


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Send FDO notifications that exercise GNOME Shell grouping paths. "
            "Without desktop-entry, notifications from the same process and the "
            "same app-name group by pid+appName. With desktop-entry, they group "
            "by the resolved app when that desktop file exists."
        )
    )
    parser.add_argument("--count", type=int, default=2)
    parser.add_argument("--delay-ms", type=int, default=300)
    parser.add_argument("--app-name", default="FdoGroupingTest")
    parser.add_argument("--desktop-entry")
    parser.add_argument("--summary", default="FDO grouping test")
    parser.add_argument("--body", default="first notification")
    parser.add_argument("--app-icon", default="")
    parser.add_argument("--timeout", type=int, default=5000)
    parser.add_argument(
        "--urgency",
        choices=tuple(URGENCY),
        default="normal",
    )
    parser.add_argument("--resident", action="store_true")
    parser.add_argument("--transient", action="store_true")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--followup-app-name")
    parser.add_argument("--followup-desktop-entry")
    parser.add_argument("--followup-summary", default="FDO grouping test")
    parser.add_argument("--followup-body", default="follow-up notification")
    return parser


def build_specs(arguments: argparse.Namespace) -> tuple[NotificationSpec, NotificationSpec]:
    first = NotificationSpec(
        app_name=arguments.app_name,
        summary=arguments.summary,
        body=arguments.body,
        app_icon=arguments.app_icon,
        desktop_entry=arguments.desktop_entry,
        expire_timeout=arguments.timeout,
        resident=arguments.resident,
        transient=arguments.transient,
        urgency=arguments.urgency,
    )

    followup = NotificationSpec(
        app_name=arguments.followup_app_name or arguments.app_name,
        summary=arguments.followup_summary,
        body=arguments.followup_body,
        app_icon=arguments.app_icon,
        desktop_entry=arguments.followup_desktop_entry
        if arguments.followup_desktop_entry is not None
        else arguments.desktop_entry,
        expire_timeout=arguments.timeout,
        resident=arguments.resident,
        transient=arguments.transient,
        urgency=arguments.urgency,
    )

    return first, followup


def print_plan(arguments: argparse.Namespace, first: NotificationSpec, followup: NotificationSpec) -> None:
    print(f"pid={os.getpid()}")
    print(
        f"first app_name={first.app_name!r} desktop_entry={first.desktop_entry!r} replace_id=0"
    )

    followup_replace_id = "first notification id" if arguments.replace else "0"
    print(
        "follow-up "
        f"app_name={followup.app_name!r} "
        f"desktop_entry={followup.desktop_entry!r} "
        f"replace_id={followup_replace_id}"
    )

    if followup.desktop_entry:
        print("expected grouping path: app")
    else:
        print("expected grouping path: pid+appName")


def main(argv: list[str]) -> int:
    parser = build_argument_parser()
    arguments = parser.parse_args(argv)

    if arguments.count < 1:
        parser.error("--count must be at least 1")

    first, followup = build_specs(arguments)
    print_plan(arguments, first, followup)

    client = NotificationClient()
    first_id = client.notify(first, 0)
    print(f"sent #1 id={first_id}")

    for index in range(1, arguments.count):
        if arguments.delay_ms > 0:
            time.sleep(arguments.delay_ms / 1000)

        current_replaces_id = first_id if arguments.replace else 0
        current_id = client.notify(followup, current_replaces_id)
        print(f"sent #{index + 1} id={current_id}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
