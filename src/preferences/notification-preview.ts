import type Gio from "gi://Gio";
import type Gtk from "gi://Gtk";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type { NotificationTheme } from "../utils/constants.js";
import { previewTypography } from "./preview.js";

function fill(color: number[]): string {
  const channels = color
    .slice(0, 3)
    .map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255));
  return `fill="rgb(${channels.join(",")})" fill-opacity="${Math.min(1, Math.max(0, color[3] ?? 1))}"`;
}

export function notificationPreview(
  theme: NotificationTheme | null,
  hideHeader: boolean,
  widget: Gtk.Widget,
  desktop: Gio.Settings,
): string {
  const { fontFamily, fontSize, renderText } = previewTypography(
    widget,
    desktop,
  );
  const width = Math.ceil(fontSize * 34) + 14;
  const contentLeft = 13;
  const textWidth = width - (hideHeader ? 112 : 32);
  const foreground = [0.98, 0.98, 0.98, 1];
  const secondary = [0.6, 0.6, 0.61, 1];
  const title = renderText(
    _("Notification title"),
    theme?.titleFontSize ?? fontSize,
    true,
    textWidth,
  );
  const body = renderText(
    _("This is how your notification will look."),
    theme?.bodyFontSize ?? fontSize,
    false,
    textWidth,
  );
  const time = renderText(
    _("Just now"),
    theme?.timeFontSize ?? fontSize * 0.818,
    false,
    width / 3,
  );
  const source = renderText(
    _("Example App"),
    theme?.appNameFontSize ?? fontSize,
    true,
    width - time.width - 123,
  );
  const headerContentHeight = Math.max(24, source.height, time.height + 1) + 6;
  const headerHeight = Math.max(34, headerContentHeight);
  const bodyTop = hideHeader ? 15 : 13 + headerHeight;
  const bodyHeight = title.height + 4 + body.height;
  const height = Math.max(64, bodyTop + bodyHeight + 13);
  const headerBottom = Math.round(
    7 + (headerHeight - headerContentHeight) / 2 + headerContentHeight - 6,
  );
  const controlsMiddle = Math.floor(
    hideHeader ? bodyTop + bodyHeight / 2 : 7 + headerHeight / 2,
  );
  const closeMiddle = width - (hideHeader ? 30 : 24);
  const button = (horizontal: number, glyph: string) =>
    `<g transform="translate(${horizontal} ${controlsMiddle})"><circle r="14" fill="#ffffff" fill-opacity=".10"/>${glyph}</g>`;
  const close = button(
    closeMiddle,
    '<path d="m-4-4 8 8m0-8-8 8" stroke="#fafafa" stroke-width="2"/>',
  );
  const expand = body.truncated
    ? button(
        closeMiddle - 37,
        '<path d="m-4-2 4 4 4-4" fill="none" stroke="#fafafa" stroke-width="2"/>',
      )
    : "";
  const header = hideHeader
    ? ""
    : `
<g fill="#a0a0a7"><circle cx="${contentLeft + 8}" cy="${controlsMiddle}" r="8"/><path d="M${contentLeft + 5} ${controlsMiddle}h6m-3-3v6" stroke="#eeeeef" stroke-width="1.5"/></g>
<text x="${contentLeft + 22}" y="${headerBottom - source.height + source.baseline}" ${fill(theme?.appNameColor ?? secondary)}>${source.markup}</text>
<text x="${contentLeft + 28 + source.width}" y="${headerBottom - time.height - 1 + time.baseline}" ${fill(theme?.timeColor ?? secondary)}>${time.markup}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" rx="16" ${fill(theme?.backgroundColor ?? [0.329, 0.329, 0.353, 1])}/>
<g font-family="${fontFamily}">${header}${expand}${close}
<text x="${contentLeft}" y="${bodyTop + title.baseline}" ${fill(theme?.titleColor ?? foreground)}>${title.markup}</text>
<text x="${contentLeft}" y="${bodyTop + title.height + 4 + body.baseline}" ${fill(theme?.bodyColor ?? foreground)}>${body.markup}</text>
</g>
</svg>`;
}
