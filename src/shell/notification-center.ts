import Clutter from "gi://Clutter";
import St from "gi://St";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import * as Calendar from "resource:///org/gnome/shell/ui/calendar.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageList from "resource:///org/gnome/shell/ui/messageList.js";
import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../utils/settings.js";
import { applyNotificationTheme } from "../utils/themes.js";
import {
  type NotificationWidgets,
  resolveBannerWidgets,
} from "./notification-widgets.js";

type NotificationMessage = St.Widget & {
  notification: Notification | null;
};

type NotificationNamespace = {
  NotificationMessage: new (notification: Notification) => NotificationMessage;
};

type Appearance = {
  widgets: NotificationWidgets;
  styles: Map<St.Widget, string | null>;
  header: St.Widget | null;
  headerParent: Clutter.Actor | null;
  headerIndex: number;
  headerExpands: boolean;
  headerAlignment: Clutter.ActorAlign;
  headerChildren: Map<Clutter.Actor, boolean>;
  content: St.Widget | null;
  contentStyle: string | null;
  hidden: boolean;
};

const SHELL_VERSION = Number.parseInt(Config.PACKAGE_VERSION, 10);
const STACK_STATES = new Set(["second-in-stack", "lower-in-stack"]);

function extendStyle(original: string | null, overrides: string) {
  return original
    ? `${original.replace(/;\s*$/, "")}; ${overrides}`
    : overrides;
}

function lightness(channels: number[]) {
  return (Math.max(...channels) + Math.min(...channels)) / 2;
}

function shadeBackground(background: number[], adjustment: number) {
  const channels = background.slice(0, 3);
  const original = lightness(channels);
  const adjusted = Math.max(0, Math.min(1, original + adjustment));
  const range = Math.max(...channels) - Math.min(...channels);
  const saturation = range === 0 ? 0 : range / (1 - Math.abs(2 * original - 1));
  const chroma = (1 - Math.abs(2 * adjusted - 1)) * saturation;
  return [
    ...channels.map((channel) =>
      range === 0
        ? adjusted
        : adjusted + ((channel - original) * chroma) / range,
    ),
    background[3],
  ];
}

export class NotificationCenterManager {
  private signals = new Map<Clutter.Actor, number[]>();
  private messages = new Map<NotificationMessage, Appearance>();
  private settingsListener: number;
  private themeContext = St.ThemeContext.get_for_stage(
    global.stage as Clutter.Stage,
  );
  private themeSignal: number;
  private messageConstructor = (
    (SHELL_VERSION >= 48
      ? MessageList
      : Calendar) as unknown as NotificationNamespace
  ).NotificationMessage;

  constructor(private settingsManager: SettingsManager) {
    const refresh = () => {
      for (const message of this.messages.keys()) this.update(message);
    };
    this.settingsListener = settingsManager.events.on(
      "colorsEnabledChanged",
      refresh,
    );
    this.themeSignal = this.themeContext.connect("changed", refresh);
    const calendar = (
      Main.panel.statusArea.dateMenu as unknown as {
        _messageList: St.Widget;
      }
    )._messageList;
    this.watch(calendar);
  }

  private watch(actor: Clutter.Actor) {
    if (this.signals.has(actor)) return;
    const signals = [
      actor.connect("destroy", () => {
        this.signals.delete(actor);
        if (actor instanceof this.messageConstructor)
          this.messages.delete(actor);
      }),
    ];
    this.signals.set(actor, signals);
    if (actor instanceof this.messageConstructor) {
      const widgets = resolveBannerWidgets(actor);
      const styles = new Map<St.Widget, string | null>();
      for (const widget of [
        widgets.container,
        widgets.source,
        widgets.time,
        widgets.title,
        widgets.body,
      ]) {
        if (widget) styles.set(widget, widget.get_style());
      }
      const header = widgets.source
        ?.get_parent()
        ?.get_parent() as St.Widget | null;
      const headerParent = header?.get_parent() ?? null;
      const content = header?.get_next_sibling() as St.Widget | null;
      this.messages.set(actor, {
        widgets,
        styles,
        header,
        headerParent,
        headerIndex: header
          ? (headerParent?.get_children().indexOf(header) ?? 0)
          : 0,
        headerExpands: header?.x_expand ?? false,
        headerAlignment: header?.y_align ?? Clutter.ActorAlign.FILL,
        headerChildren: new Map(
          (header?.get_children().slice(0, 2) ?? []).map((child) => [
            child,
            child.visible,
          ]),
        ),
        content,
        contentStyle: content?.get_style() ?? null,
        hidden: false,
      });
      for (const property of ["title", "body", "pseudo-class"]) {
        signals.push(
          actor.connect(`notify::${property}`, () => this.update(actor)),
        );
      }
      this.update(actor);
      return;
    }
    signals.push(
      actor.connect("child-added", (_parent, child) => this.watch(child)),
    );
    for (const child of actor.get_children()) this.watch(child);
  }

  private setHeaderHidden(appearance: Appearance, hidden: boolean) {
    const { header, headerParent, content } = appearance;
    if (!header || !headerParent || !content || appearance.hidden === hidden)
      return;
    header.get_parent()?.remove_child(header);
    if (hidden) {
      for (const child of appearance.headerChildren.keys()) child.hide();
      header.x_expand = false;
      header.y_align = Clutter.ActorAlign.CENTER;
      content.set_style(extendStyle(appearance.contentStyle, "margin-top: 0;"));
      content.add_child(header);
    } else {
      for (const [child, visible] of appearance.headerChildren)
        child.visible = visible;
      header.x_expand = appearance.headerExpands;
      header.y_align = appearance.headerAlignment;
      content.set_style(appearance.contentStyle);
      headerParent.insert_child_at_index(header, appearance.headerIndex);
    }
    appearance.hidden = hidden;
  }

  private stackAdjustment(
    message: NotificationMessage,
    original: string | null,
  ) {
    const node = message.get_theme_node();
    const states = node.get_pseudo_classes();
    if (!states.some((state) => STACK_STATES.has(state))) return 0;
    const background = (pseudoClasses: string[]) => {
      const reference = St.ThemeNode.new(
        this.themeContext,
        node.get_parent(),
        node.get_theme(),
        node.get_element_type(),
        node.get_element_id(),
        node.get_element_classes().join(" "),
        pseudoClasses.join(" "),
        original ?? "",
      ).get_background_color();
      return lightness([
        reference.red / 255,
        reference.green / 255,
        reference.blue / 255,
      ]);
    };
    return (
      background(states) -
      background(states.filter((state) => !STACK_STATES.has(state)))
    );
  }

  private update(message: NotificationMessage) {
    const appearance = this.messages.get(message);
    if (!appearance) return;
    for (const [widget, style] of appearance.styles) widget.set_style(style);
    const notification = message.notification;
    if (!notification) return;
    const source = notification.source?.title ?? "";
    const title = notification.title ?? "";
    const body = notification.body ?? "";
    const enabled =
      this.settingsManager.followBannerAppearance &&
      this.settingsManager.getConfigurationFor(source, title, body).enabled;
    this.setHeaderHidden(
      appearance,
      enabled &&
        this.settingsManager.shouldHideAppTitleRowFor(source, title, body),
    );
    if (!enabled) return;
    const margins = this.settingsManager.getMarginsFor(source, title, body);
    if (margins)
      message.set_style(
        extendStyle(
          message.get_style(),
          `margin-top: ${margins.top}px; margin-bottom: ${margins.bottom}px; margin-left: ${margins.left}px; margin-right: ${margins.right}px;`,
        ),
      );
    const theme = this.settingsManager.getThemeFor(source, title, body);
    if (theme) {
      applyNotificationTheme(appearance.widgets, {
        ...theme,
        backgroundColor: shadeBackground(
          theme.backgroundColor,
          this.stackAdjustment(message, appearance.styles.get(message) ?? null),
        ),
      });
    }
  }

  dispose() {
    this.settingsManager.events.off(this.settingsListener);
    this.themeContext.disconnect(this.themeSignal);
    for (const [actor, signals] of this.signals) {
      for (const signal of signals) actor.disconnect(signal);
    }
    this.signals.clear();
    for (const appearance of this.messages.values()) {
      this.setHeaderHidden(appearance, false);
      for (const [widget, style] of appearance.styles) widget.set_style(style);
    }
    this.messages.clear();
  }
}
