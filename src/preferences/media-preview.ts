import type Gio from "gi://Gio";
import type Gtk from "gi://Gtk";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import {
  MEDIA_PLAYER_LAYOUT,
  hideMediaSource,
  mediaPlayerHeight,
} from "../utils/media-player.js";
import type { MediaPlayerConfiguration } from "../utils/settings.js";

import { previewTypography } from "./preview.js";

export function mediaPlayerPreview(
  configuration: MediaPlayerConfiguration,
  widget: Gtk.Widget,
  desktop: Gio.Settings,
): string {
  const dimensions = MEDIA_PLAYER_LAYOUT;
  const width = dimensions.width;
  const height = mediaPlayerHeight(configuration.enlarge);
  const { fontFamily, fontSize, renderText } = previewTypography(
    widget,
    desktop,
  );
  const sourceHidden = hideMediaSource(configuration, "Mozilla zen");
  const coverWidth =
    configuration.thumbnail === "big"
      ? Math.min(height, width * dimensions.coverMaximumWidth)
      : 0;
  const stacked = coverWidth > 0 && configuration.enlarge;
  const smallCover = configuration.thumbnail === "small";
  const contentStart = coverWidth + dimensions.padding + dimensions.bodyPadding;
  const textStart =
    contentStart +
    (smallCover ? dimensions.thumbnailSize + dimensions.thumbnailSpacing : 0);
  const controlsStart = stacked
    ? coverWidth +
      dimensions.padding +
      (dimensions.controlWidth - dimensions.controlSize) / 2
    : width -
      dimensions.padding -
      dimensions.bodyPadding -
      dimensions.controlWidth * 3 +
      (dimensions.controlWidth - dimensions.controlSize) / 2;
  const controlsStep =
    dimensions.controlWidth + (stacked ? dimensions.controlSpacing : 0);
  const textWidth = stacked
    ? width - textStart - 18
    : controlsStart - 25 - textStart;
  const title = renderText(
    _("Track title"),
    configuration.enlarge ? dimensions.enlargedTitleSize : fontSize,
    true,
    textWidth,
  );
  const artist = renderText(
    _("Artist name"),
    configuration.enlarge ? dimensions.enlargedBodySize : fontSize,
    false,
    textWidth,
  );
  const sourceTitle = renderText(
    "Mozilla zen",
    fontSize,
    true,
    width - contentStart - 48,
  );
  const textHeight = title.height + dimensions.textSpacing + artist.height;
  const textTop = Math.floor(
    (height - textHeight) / 2 + (sourceHidden ? 6 : 15) - (stacked ? 9 : 0),
  );
  const controlsTop = stacked
    ? height - 29
    : Math.floor(
        textTop +
          Math.max(textHeight, smallCover ? dimensions.thumbnailSize : 0) / 2,
      ) -
      dimensions.controlSize / 2;
  const artwork = (horizontal: number, vertical: number, size: number) =>
    `<svg x="${horizontal}" y="${vertical}" width="${size}" height="${size}" viewBox="0 0 160 160"><use href="#artwork"/></svg>`;
  const background =
    configuration.background === "empty"
      ? ""
      : `<g ${configuration.background === "blurred" ? 'filter="url(#blur)"' : ""}>${artwork(0, height / 2 - width / 2, width)}</g><rect width="${width}" height="${height}" fill="#10171c" opacity="${configuration.background === "blurred" ? 0.56 : 0.6}"/>`;
  const source = sourceHidden
    ? ""
    : `<g fill="#b7b7bc"><circle cx="${contentStart + 8}" cy="24" r="8"/><path d="M${contentStart + 4} 24h8m-4-4v8" stroke="#e9e9ec" stroke-width="1.5"/><text x="${contentStart + 22}" y="${17 + sourceTitle.baseline}">${sourceTitle.markup}</text></g>`;
  const thumbnail =
    coverWidth > 0
      ? `<g clip-path="url(#big-cover)">${artwork(0, (height - coverWidth) / 2, coverWidth)}</g>`
      : smallCover
        ? `<g clip-path="url(#small-cover)">${artwork(contentStart, textTop, dimensions.thumbnailSize)}</g>`
        : "";
  const controls = [0, 1, 2]
    .map((index) => {
      const icon =
        index === 1
          ? '<path d="M3 2h4v12H3Zm6 0h4v12H9Z"/>'
          : `<g ${index === 2 ? 'transform="translate(16 0) scale(-1 1)"' : ""}><path d="M1 2h2v12H1Zm3 6 10-6v12Z"/></g>`;
      return `<g transform="translate(${controlsStart + index * controlsStep} ${controlsTop})">${icon}</g>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <linearGradient id="sky" x2="1" y2="1"><stop stop-color="#739387"/><stop offset="1" stop-color="#253c54"/></linearGradient>
  <linearGradient id="hill" x2="1" y2="1"><stop stop-color="#405b56"/><stop offset="1" stop-color="#172b35"/></linearGradient>
  <g id="artwork"><rect width="160" height="160" fill="url(#sky)"/><circle cx="111" cy="49" r="32" fill="#f0c893"/><path d="M0 127 58 53 121 160H0Z" fill="#718c76"/><path d="M33 160 114 78 160 131V160Z" fill="url(#hill)"/><path d="M0 146Q80 115 160 148V160H0Z" fill="#203d43"/></g>
  <filter id="blur" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="${dimensions.blurRadius}"/></filter>
  <clipPath id="card"><rect width="${width}" height="${height}" rx="${dimensions.coverRadius}"/></clipPath>
  <clipPath id="big-cover"><rect y="${(height - coverWidth) / 2}" width="${coverWidth}" height="${coverWidth}" rx="${dimensions.coverRadius}"/></clipPath>
  <clipPath id="small-cover"><rect x="${contentStart}" y="${textTop}" width="${dimensions.thumbnailSize}" height="${dimensions.thumbnailSize}" rx="${dimensions.thumbnailRadius}"/></clipPath>
</defs>
<g clip-path="url(#card)" font-family="${fontFamily}" ${configuration.enabled ? "" : 'opacity=".35"'}>
<rect width="${width}" height="${height}" fill="#52525a"/>${background}${thumbnail}${source}
<text x="${textStart}" y="${textTop + title.baseline}" fill="#fafafa">${title.markup}</text>
<text x="${textStart}" y="${textTop + title.height + dimensions.textSpacing + artist.baseline}" fill="#fafafa">${artist.markup}</text>
<g fill="#fafafa">${controls}</g>
</g>
</svg>`;
}
