import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";

declare module "resource:///org/gnome/shell/ui/notificationDaemon.js" {
	export * from "@girs/gnome-shell/ui/notificationDaemon";

	export class FdoNotificationDaemonSource {
		processNotification(
			notification: Notification,
			appName: string,
			appIcon: string,
		): void;
	}

	export class GtkNotificationDaemonAppSource {
		addNotification(notification: Notification): void;
	}
}
