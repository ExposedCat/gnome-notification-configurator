import type Clutter from "gi://Clutter";
import type St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";

type NotificationContainer = St.Widget & {
  notification?: Notification | null;
};

export type NotificationWidgets = {
  container: St.Widget;
  sourceText: Clutter.Text | null;
  source: St.Bin | null;
  time: St.Bin | null;
  title: St.Bin | null;
  body: St.Bin | null;
  sourceName: string;
  titleText: string;
  bodyText: string;
};

const hiddenHeaders = new WeakSet<Clutter.Actor>();
const resolvedWidgets = new WeakMap<St.Widget, NotificationWidgets>();

export function getMessageTrayContainer() {
  return Main.messageTray.get_first_child();
}

export function getBannerBin() {
  return (Main.messageTray as unknown as { _bannerBin: St.Widget })._bannerBin;
}

export function getFirstBannerRow(banner = getBannerBin()) {
  return (
    (banner
      ?.get_first_child()
      ?.get_child_at_index(0)
      ?.get_child_at_index(0) as St.Widget | null) ?? null
  );
}

export function hideBannerAppTitleRow(banner = getBannerBin()) {
  const message = banner?.get_first_child();
  if (!message) return false;
  if (hiddenHeaders.has(message)) return true;

  const appTitleRow = getFirstBannerRow(banner);
  if (!appTitleRow) return false;

  for (const _ of [0, 1]) {
    const child = appTitleRow.get_child_at_index(0);
    child?.get_parent()?.remove_child(child);
  }

  appTitleRow.set_x_expand(false);
  appTitleRow.get_parent()?.remove_child(appTitleRow);

  const targetWrapper = getFirstBannerRow(banner);

  targetWrapper?.set_style("margin-top: 2px !important");
  targetWrapper?.add_child(appTitleRow);
  hiddenHeaders.add(message);

  return true;
}

function readText(actor: Clutter.Actor | null | undefined) {
  return (actor as Clutter.Text | null)?.text ?? "";
}

export function resolveNotificationWidgets(
  messageTrayContainer: Clutter.Actor | null | undefined,
): NotificationWidgets | null {
  const container = messageTrayContainer?.get_first_child() as St.Widget | null;
  return container ? resolveBannerWidgets(container) : null;
}

export function resolveBannerWidgets(
  container: St.Widget,
): NotificationWidgets {
  let widgets = resolvedWidgets.get(container);
  if (!widgets) {
    const notification = container.get_first_child();
    const header =
      notification?.get_first_child() !== notification?.get_last_child()
        ? notification?.get_first_child()
        : null;
    const headerContent = header?.get_child_at_index(1) as St.BoxLayout | null;
    const source = headerContent?.get_child_at_index(0) as St.Bin | null;
    const sourceText = source?.get_first_child() as Clutter.Text | null;
    const time = headerContent?.get_child_at_index(1) as St.Bin | null;
    const content = notification?.get_child_at_index(1);
    const contentBody = content?.get_child_at_index(1) as St.BoxLayout | null;
    const title = contentBody?.get_child_at_index(0) as St.Bin | null;
    const body = contentBody?.get_child_at_index(1) as St.Bin | null;
    widgets = {
      container,
      sourceText,
      source,
      time,
      title,
      body,
      sourceName: "",
      titleText: "",
      bodyText: "",
    };
    resolvedWidgets.set(container, widgets);
  }

  const notification = (container as NotificationContainer).notification;
  widgets.sourceName =
    notification?.source?.title ??
    widgets.sourceText?.text ??
    widgets.sourceName;
  widgets.titleText = notification
    ? (notification.title ?? "")
    : readText(widgets.title?.get_first_child()) || widgets.titleText;
  widgets.bodyText = notification
    ? (notification.body ?? "")
    : readText(widgets.body?.get_first_child()) || widgets.bodyText;

  return widgets;
}
