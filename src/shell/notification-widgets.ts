import type Clutter from "gi://Clutter";
import type St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

type NotificationMetadata = {
  sourceName: string;
  titleText: string;
  bodyText: string;
};

type NotificationContainer = St.Widget & {
  notificationConfiguratorMetadata?: NotificationMetadata;
};

export type NotificationWidgets = {
  container: St.Widget;
  sourceText: Clutter.Text | null;
  source: St.Bin | null;
  time: St.Bin | null;
  title: St.Label | null;
  body: St.Label | null;
  sourceName: string;
  titleText: string;
  bodyText: string;
};

export function getMessageTrayContainer() {
  return Main.messageTray.get_first_child();
}

export function getBannerBin() {
  return (Main.messageTray as unknown as { _bannerBin: St.Widget })._bannerBin;
}

export function getFirstBannerRow() {
  return (
    (getBannerBin()
      ?.get_first_child()
      ?.get_child_at_index(0)
      ?.get_child_at_index(0) as St.Widget | null) ?? null
  );
}

export function hideBannerAppTitleRow() {
  const appTitleRow = getFirstBannerRow();
  if (!appTitleRow) return false;

  for (const _ of [0, 1]) {
    const child = appTitleRow.get_child_at_index(0);
    child?.get_parent()?.remove_child(child);
  }

  appTitleRow.set_x_expand(false);
  appTitleRow.get_parent()?.remove_child(appTitleRow);

  const targetWrapper = getFirstBannerRow();

  targetWrapper?.set_style("margin-top: 2px !important");
  targetWrapper?.add_child(appTitleRow);

  return true;
}

function getNotificationMetadata(container: St.Widget) {
  return (container as NotificationContainer).notificationConfiguratorMetadata;
}

function setNotificationMetadata(
  container: St.Widget,
  metadata: NotificationMetadata,
) {
  (container as NotificationContainer).notificationConfiguratorMetadata =
    metadata;
}

function readText(actor: Clutter.Actor | null | undefined) {
  return (actor as Clutter.Text | null)?.text ?? "";
}

function findByClass(
  root: Clutter.Actor | null | undefined,
  className: string,
): St.Label | null {
  if (!root) return null;
  const n = root.get_n_children();
  for (let i = 0; i < n; i++) {
    const child = root.get_child_at_index(i) as St.Widget | null;
    if (!child) continue;
    if (child.get_style_class_name?.()?.split(" ").includes(className))
      return child as St.Label;
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

export function resolveNotificationWidgets(
  messageTrayContainer: Clutter.Actor | null | undefined,
): NotificationWidgets | null {
  const container = messageTrayContainer?.get_first_child() as St.Widget | null;
  if (!container) return null;

  const notification = container.get_first_child();
  const header =
    notification?.get_first_child() !== notification?.get_last_child()
      ? notification?.get_first_child()
      : null;
  const headerContent = header?.get_child_at_index(1) as St.BoxLayout | null;
  const source = headerContent?.get_child_at_index(0) as St.Bin | null;
  const sourceText = source?.get_first_child() as Clutter.Text | null;
  const time = headerContent?.get_child_at_index(1) as St.Bin | null;

  // Use CSS class lookup for title/body — resilient to layout changes across
  // GNOME versions. Index-based traversal broke in GNOME 49 because _actionBin
  // is now always added as the last child of the notification vbox (even when
  // hidden), so get_last_child() returned _actionBin instead of the content hbox.
  const title = findByClass(notification, "message-title");
  const body = findByClass(notification, "message-body");

  const metadata = getNotificationMetadata(container);

  const sourceName = sourceText?.text ?? metadata?.sourceName ?? "";
  const titleText = readText(title) || metadata?.titleText || "";
  const bodyText = readText(body) || metadata?.bodyText || "";

  setNotificationMetadata(container, {
    sourceName,
    titleText,
    bodyText,
  });

  return {
    container,
    sourceText,
    source,
    time,
    title,
    body,
    sourceName,
    titleText,
    bodyText,
  };
}
