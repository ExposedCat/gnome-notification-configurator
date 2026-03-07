import type Clutter from "gi://Clutter";
import type St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export type NotificationWidgets = {
  container: St.Widget;
  sourceText: Clutter.Text;
  source: St.Bin;
  time: St.Bin;
  title: St.Bin;
  body: St.Bin;
};

export function getMessageTrayContainer() {
  return Main.messageTray.get_first_child();
}

export function resolveNotificationWidgets(
  messageTrayContainer: Clutter.Actor | null | undefined,
): NotificationWidgets | null {
  const container = messageTrayContainer?.get_first_child() as St.Widget | null;
  if (!container) return null;

  const notification = container.get_first_child();
  const header = notification?.get_child_at_index(0);
  const headerContent = header?.get_child_at_index(1) as St.BoxLayout | null;
  const source = headerContent?.get_child_at_index(0) as St.Bin;
  const sourceText = source?.get_first_child() as Clutter.Text;

  if (!sourceText) return null;

  const time = headerContent?.get_child_at_index(1) as St.Bin;
  const content = notification?.get_child_at_index(1);
  const contentBody = content?.get_child_at_index(1) as St.BoxLayout | null;
  const title = contentBody?.get_child_at_index(0) as St.Bin;
  const body = contentBody?.get_child_at_index(1) as St.Bin;

  return { container, sourceText, source, time, title, body };
}
