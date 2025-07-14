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
