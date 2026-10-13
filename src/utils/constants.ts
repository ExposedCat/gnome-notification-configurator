type Color = number[];

export type NotificationTheme = {
  appNameColor: Color;
  timeColor: Color;
  backgroundColor: Color;
  titleColor: Color;
  bodyColor: Color;
  appNameFontSize: number;
  timeFontSize: number;
  titleFontSize: number;
  bodyFontSize: number;
};

export const DEFAULT_INDICATOR_COLOR: Color = [
  0.207843137, 0.517647059, 0.894117647, 1,
];

export const DEFAULT_COUNTS_COLOR: Color = [
  0.878431373, 0.105882353, 0.141176471, 1,
];

export const DEFAULT_THEME: NotificationTheme = {
  appNameColor: [0.6, 0.6, 0.607843137, 1],
  timeColor: [0.6, 0.6, 0.607843137, 1],
  backgroundColor: [0.329411765, 0.329411765, 0.352941176, 1],
  titleColor: [0.992156863, 0.992156863, 0.992156863, 1],
  bodyColor: [0.992156863, 0.992156863, 0.992156863, 1],
  appNameFontSize: 18,
  timeFontSize: 14,
  titleFontSize: 18,
  bodyFontSize: 18,
};
