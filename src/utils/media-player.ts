import type { MediaPlayerConfiguration } from "./settings.js";

export const MEDIA_PLAYER_LAYOUT = {
  width: 413,
  compactHeight: 108,
  enlargedHeight: 176,
  enlargedTitleSize: 24,
  enlargedBodySize: 18,
  padding: 12,
  bodyPadding: 6,
  textSpacing: 4,
  thumbnailSize: 48,
  thumbnailSpacing: 12,
  thumbnailRadius: 10,
  coverRadius: 20,
  coverMaximumWidth: 0.45,
  controlSize: 16,
  controlWidth: 54,
  controlSpacing: 12,
  blurRadius: 24,
} as const;

export function mediaPlayerHeight(enlarge: boolean): number {
  return enlarge
    ? MEDIA_PLAYER_LAYOUT.enlargedHeight
    : MEDIA_PLAYER_LAYOUT.compactHeight;
}

export function hideMediaSource(
  configuration: MediaPlayerConfiguration,
  title: string,
): boolean {
  if (configuration.source !== "hide") return false;
  const pattern = configuration.sourceRegex.trim();
  if (!pattern) return true;
  try {
    return new RegExp(pattern, "i").test(title);
  } catch {
    return false;
  }
}
