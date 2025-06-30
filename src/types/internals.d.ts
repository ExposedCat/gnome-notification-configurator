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

declare module "resource:///org/gnome/shell/ui/messageTray.js" {
	export * from "@girs/gnome-shell/ui/messageTray";
	import type { Urgency } from "@girs/gnome-shell/ui/messageTray";

	export type MessageTrayProto = {
		_updateNotificationTimeout: (timeout: number) => void;
		_updateState: () => void;
		_userActiveWhileNotificationShown?: boolean;
	};

	export type NotificationProto = {
		setUrgency: (urgency: Urgency) => void;
	};
}
