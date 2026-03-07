import type { NotificationTheme } from "./constants.js";
import { DEFAULT_THEME } from "./constants.js";

export type NotificationAction = "hide" | "close";
export type Position = "fill" | "left" | "right" | "center";

export function normalizeAction(
  value: unknown,
  fallback: NotificationAction = "hide",
): NotificationAction {
  if (value === "close" || value === "hide") {
    return value;
  }
  return fallback;
}

export function normalizePosition(value: unknown): Position {
  return value === "fill" || value === "left" || value === "right"
    ? value
    : "center";
}

export function normalizeNumber(candidate: unknown, fallback: number): number {
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : fallback;
}

export function normalizeColor(
  candidate: unknown,
  fallback: number[],
): number[] {
  if (!Array.isArray(candidate) || candidate.length !== 4) {
    return [...fallback];
  }
  const normalized: number[] = [];
  for (const [index, value] of candidate.entries()) {
    normalized.push(normalizeNumber(value, fallback[index]));
  }
  return normalized;
}

export function normalizeTheme(theme: unknown): NotificationTheme {
  const candidate = (theme ?? {}) as Partial<NotificationTheme>;
  return {
    appNameColor: normalizeColor(
      candidate.appNameColor,
      DEFAULT_THEME.appNameColor,
    ),
    timeColor: normalizeColor(candidate.timeColor, DEFAULT_THEME.timeColor),
    backgroundColor: normalizeColor(
      candidate.backgroundColor,
      DEFAULT_THEME.backgroundColor,
    ),
    titleColor: normalizeColor(candidate.titleColor, DEFAULT_THEME.titleColor),
    bodyColor: normalizeColor(candidate.bodyColor, DEFAULT_THEME.bodyColor),
    appNameFontSize: normalizeNumber(
      candidate.appNameFontSize,
      DEFAULT_THEME.appNameFontSize,
    ),
    timeFontSize: normalizeNumber(
      candidate.timeFontSize,
      DEFAULT_THEME.timeFontSize,
    ),
    titleFontSize: normalizeNumber(
      candidate.titleFontSize,
      DEFAULT_THEME.titleFontSize,
    ),
    bodyFontSize: normalizeNumber(
      candidate.bodyFontSize,
      DEFAULT_THEME.bodyFontSize,
    ),
  };
}
