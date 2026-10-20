import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gdk from "gi://Gdk";
import type Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import Pango from "gi://Pango";

type PreviewText = {
  width: number;
  height: number;
  baseline: number;
  markup: string;
  truncated: boolean;
};

export function createSvgPreview(description: string) {
  const picture = new Gtk.Picture({
    can_shrink: true,
    content_fit: Gtk.ContentFit.SCALE_DOWN,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12,
    alternative_text: description,
  });
  const row = new Adw.PreferencesRow({
    child: picture,
    activatable: false,
    selectable: false,
  });
  const update = (svg: string) => {
    const texture = Gdk.Texture.new_from_bytes(
      new GLib.Bytes(new TextEncoder().encode(svg)),
    );
    picture.set_paintable(texture);
    picture.set_size_request(-1, texture.get_intrinsic_height());
  };
  return { picture, row, update };
}

export function previewTypography(widget: Gtk.Widget, desktop: Gio.Settings) {
  const fontName = desktop.get_string("font-name");
  const font = Pango.FontDescription.from_string(fontName);
  const fontFamily = GLib.markup_escape_text(
    font.get_family() ?? "sans-serif",
    -1,
  );
  const fontSize =
    (font.get_size() / Pango.SCALE) *
    (font.get_size_is_absolute() ? 1 : 96 / 72);
  const textScale = desktop.get_double("text-scaling-factor");
  const context =
    widget.get_pango_context().get_font_map()?.create_context() ??
    widget.get_pango_context();
  const renderText = (
    text: string,
    size: number,
    bold: boolean,
    availableWidth: number,
  ): PreviewText => {
    if (size <= 0 || availableWidth <= 0)
      return { width: 0, height: 0, baseline: 0, markup: "", truncated: false };
    const description = Pango.FontDescription.from_string(fontName);
    description.set_absolute_size(size * textScale * Pango.SCALE);
    description.set_weight(bold ? Pango.Weight.BOLD : Pango.Weight.NORMAL);
    const layout = Pango.Layout.new(
      context as unknown as Parameters<typeof Pango.Layout.new>[0],
    );
    layout.set_text(text, -1);
    layout.set_font_description(description);
    let displayed = text;
    while (
      layout.get_pixel_size()[0] > availableWidth &&
      displayed.length > 1
    ) {
      displayed = `${Array.from(displayed.replace(/…$/, "")).slice(0, -1).join("")}…`;
      layout.set_text(displayed, -1);
    }
    const [width, height] = layout.get_pixel_size();
    return {
      width,
      height,
      truncated: displayed !== text,
      baseline: layout.get_baseline() / Pango.SCALE,
      markup: `<tspan font-size="${size * textScale}" font-weight="${bold ? 700 : 400}">${GLib.markup_escape_text(displayed, -1)}</tspan>`,
    };
  };
  return { fontFamily, fontSize, renderText };
}
