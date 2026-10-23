import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import St from "gi://St";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Config from "resource:///org/gnome/shell/misc/config.js";
import * as Calendar from "resource:///org/gnome/shell/ui/calendar.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageList from "resource:///org/gnome/shell/ui/messageList.js";
import type { Notification } from "resource:///org/gnome/shell/ui/messageTray.js";
import type { SettingsManager } from "../utils/settings.js";
import { applyNotificationTheme, makeColorStyle } from "../utils/themes.js";
import { NotificationMask } from "./notification-mask.js";
import {
  type NotificationWidgets,
  resolveBannerWidgets,
  setNotificationBodyHidden,
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
  bodyClipped: boolean;
  contentOpacities: Map<Clutter.Actor, number>;
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

function blendColor(foreground: number[], background: number[]) {
  const opacity = foreground[3] + background[3] * (1 - foreground[3]);
  if (opacity === 0) return [0, 0, 0, 0];
  return [
    ...foreground
      .slice(0, 3)
      .map(
        (channel, index) =>
          (channel * foreground[3] +
            background[index] * background[3] * (1 - foreground[3])) /
          opacity,
      ),
    opacity,
  ];
}

export class NotificationCenterManager {
  private settingsButton?: St.Button;
  private buttonBindings: GObject.Binding[] = [];
  private signals = new Map<Clutter.Actor, number[]>();
  private messages = new Map<NotificationMessage, Appearance>();
  private stackClips = new Map<
    Clutter.Actor,
    [number, number, number, number] | null
  >();
  private stackMasks = new Map<Clutter.Actor, NotificationMask>();
  private pendingStacks = new Set<Clutter.Actor>();
  private stackUpdate = 0;
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

  constructor(
    private settingsManager: SettingsManager,
    openPreferences: () => void,
  ) {
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
        _messageList: St.Widget & { _clearButton: St.Button };
      }
    )._messageList;
    const controls = calendar._clearButton.get_parent();
    if (controls) {
      this.settingsButton = new St.Button({
        style_class: "message-list-clear-button button",
        style: "padding-left: 0; padding-right: 0;",
        can_focus: true,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        accessible_name: _("Notification Configurator Settings"),
        child: new St.Icon({
          icon_name: "emblem-system-symbolic",
          style_class: "popup-menu-icon",
        }),
      });
      this.buttonBindings = [
        calendar._clearButton.bind_property(
          "height",
          this.settingsButton,
          "height",
          GObject.BindingFlags.SYNC_CREATE,
        ),
        this.settingsButton.bind_property(
          "height",
          this.settingsButton,
          "width",
          GObject.BindingFlags.SYNC_CREATE,
        ),
      ];
      this.settingsButton.connect("clicked", () => {
        Main.panel.closeCalendar();
        openPreferences();
      });
      controls.add_child(this.settingsButton);
    }
    this.watch(calendar);
  }

  private watch(actor: Clutter.Actor) {
    if (this.signals.has(actor)) return;
    const signals = [
      actor.connect("destroy", () => {
        this.signals.delete(actor);
        this.stackClips.delete(actor);
        this.stackMasks.delete(actor);
        this.pendingStacks.delete(actor);
        if (actor instanceof this.messageConstructor) {
          this.messages.delete(actor);
        }
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
        bodyClipped: widgets.body?.clip_to_allocation ?? false,
        contentOpacities: new Map(),
        hidden: false,
      });
      for (const signal of ["notify::allocation", "style-changed"])
        signals.push(
          actor.connect(signal, () =>
            this.refreshStack(actor.get_parent()?.get_parent() ?? null),
          ),
        );
      for (const property of ["title", "body", "pseudo-class"]) {
        signals.push(
          actor.connect(`notify::${property}`, () => this.update(actor)),
        );
      }
      this.update(actor);
      return;
    }
    const parent = actor.get_parent();
    const group = [actor, parent].find(
      (candidate) =>
        candidate instanceof St.Widget &&
        candidate.has_style_class_name("message-notification-group"),
    );
    if (group) {
      for (const property of ["allocation", "scale-x", "scale-y"])
        signals.push(
          actor.connect(`notify::${property}`, () => this.refreshStack(group)),
        );
    }
    signals.push(
      actor.connect("child-added", (_parent, child) => {
        this.watch(child);
        this.queueStack(group ?? null);
      }),
      actor.connect("child-removed", () => this.queueStack(group ?? null)),
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
    const states = message.get_theme_node().get_pseudo_classes();
    if (!states.some((state) => STACK_STATES.has(state))) return 0;
    const background = (pseudoClasses: string[]) => {
      const reference = this.originalTheme(
        message,
        original,
        pseudoClasses,
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

  private originalTheme(
    message: NotificationMessage,
    original: string | null,
    states?: string[],
  ) {
    const node = message.get_theme_node();
    return St.ThemeNode.new(
      this.themeContext,
      node.get_parent(),
      node.get_theme(),
      node.get_element_type(),
      node.get_element_id(),
      node.get_element_classes().join(" "),
      (states ?? node.get_pseudo_classes()).join(" "),
      original ?? "",
    );
  }

  private refreshStack(group: Clutter.Actor | null) {
    this.updateStack(group);
    this.queueStack(group);
  }

  private queueStack(group: Clutter.Actor | null) {
    if (
      !(group instanceof St.Widget) ||
      !group.has_style_class_name("message-notification-group")
    )
      return;
    this.pendingStacks.add(group);
    if (this.stackUpdate) return;
    this.stackUpdate = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this.stackUpdate = 0;
      const groups = [...this.pendingStacks];
      this.pendingStacks.clear();
      for (const pending of groups)
        if (this.signals.has(pending)) this.updateStack(pending);
      return GLib.SOURCE_REMOVE;
    });
  }

  private setStackOpacity(appearance: Appearance, expansion: number) {
    const content = appearance.widgets.container.get_first_child();
    for (const [actor, opacity] of appearance.contentOpacities) {
      if (actor.get_parent() !== content || expansion >= 1) {
        actor.opacity = opacity;
        appearance.contentOpacities.delete(actor);
      }
    }
    if (!content || expansion >= 1) return;
    for (const actor of content.get_children()) {
      const opacity = appearance.contentOpacities.get(actor) ?? actor.opacity;
      appearance.contentOpacities.set(actor, opacity);
      actor.opacity = Math.round(opacity * expansion);
    }
  }

  private restoreStackClip(actor: Clutter.Actor) {
    if (!this.stackClips.has(actor)) return;
    const clip = this.stackClips.get(actor);
    if (clip) actor.set_clip(...clip);
    else actor.remove_clip();
    this.stackClips.delete(actor);
  }

  private setStackClip(actor: Clutter.Actor, top: number, bottom: number) {
    if (top <= 0 && bottom >= actor.height) {
      this.restoreStackClip(actor);
      return;
    }
    if (!this.stackClips.has(actor))
      this.stackClips.set(actor, actor.has_clip ? actor.get_clip() : null);
    const [left, originalTop, width, height] = this.stackClips.get(actor) ?? [
      0,
      0,
      actor.width,
      actor.height,
    ];
    const clippedTop = Math.max(top, originalTop);
    actor.set_clip(
      left,
      clippedTop,
      width,
      Math.max(0, Math.min(bottom, originalTop + height) - clippedTop),
    );
  }

  private updateStack(group: Clutter.Actor | null) {
    if (
      !(group instanceof St.Widget) ||
      !group.has_style_class_name("message-notification-group")
    )
      return;
    const layout = group.layout_manager as Clutter.LayoutManager & {
      expansion: number;
    };
    const covers: NotificationMessage[] = [];
    for (const child of group.get_children()) {
      const message = child
        .get_children()
        .find(
          (candidate): candidate is NotificationMessage =>
            candidate instanceof this.messageConstructor,
        );
      if (!message) continue;
      const appearance = this.messages.get(message);
      if (appearance)
        this.setStackOpacity(appearance, covers.length ? layout.expansion : 1);
      if (covers.length >= 3 && layout.expansion === 0)
        this.setStackClip(child, child.height, child.height);
      else this.restoreStackClip(child);
      this.updateStackMask(child, covers);
      covers.push(message);
    }
    const header = group
      .get_children()
      .find(
        (child) =>
          child instanceof St.Widget &&
          child.has_style_class_name("message-group-header"),
      );
    if (header) this.updateStackMask(header, covers.slice(0, 1));
  }

  private updateStackMask(actor: Clutter.Actor, covers: St.Widget[]) {
    let mask = this.stackMasks.get(actor);
    if (!mask) {
      if (covers.length === 0) return;
      mask = new NotificationMask(actor);
      this.stackMasks.set(actor, mask);
    }
    mask.update(covers);
  }

  private update(message: NotificationMessage) {
    const appearance = this.messages.get(message);
    if (!appearance) return;
    const notification = message.notification;
    if (!notification) return;
    const source = notification.source?.title ?? "";
    const title = notification.title ?? "";
    const body = notification.body ?? "";
    const configuration = this.settingsManager.getConfigurationFor(
      source,
      title,
      body,
    );
    setNotificationBodyHidden(
      appearance.widgets,
      configuration.enabled && configuration.content.hideBody,
    );
    const enabled =
      this.settingsManager.followBannerAppearance && configuration.enabled;
    this.setHeaderHidden(
      appearance,
      enabled &&
        this.settingsManager.shouldHideAppTitleRowFor(source, title, body),
    );
    if (appearance.widgets.body)
      appearance.widgets.body.clip_to_allocation =
        enabled || appearance.bodyClipped;
    const margins = enabled
      ? this.settingsManager.getMarginsFor(source, title, body)
      : null;
    const original = appearance.styles.get(message) ?? null;
    const style = margins
      ? extendStyle(
          original,
          `margin-top: ${margins.top}px; margin-bottom: ${margins.bottom}px; margin-left: ${margins.left}px; margin-right: ${margins.right}px;`,
        )
      : original;
    const theme = enabled
      ? this.settingsManager.getThemeFor(source, title, body)
      : null;
    this.updateStack(message.get_parent()?.get_parent() ?? null);
    if (theme) {
      const backgroundColor = shadeBackground(
        theme.backgroundColor,
        this.stackAdjustment(message, original),
      );
      const border = this.originalTheme(message, original).get_border_color(
        St.Side.TOP,
      );
      const borderStyle = makeColorStyle(
        blendColor(
          [
            border.red / 255,
            border.green / 255,
            border.blue / 255,
            border.alpha / 255,
          ],
          backgroundColor,
        ),
        "border-color",
      );
      applyNotificationTheme(
        appearance.widgets,
        {
          ...theme,
          backgroundColor,
        },
        extendStyle(style, borderStyle),
      );
    } else {
      for (const [widget, original] of appearance.styles)
        widget.set_style(widget === message ? style : original);
    }
  }

  dispose() {
    if (this.stackUpdate) GLib.source_remove(this.stackUpdate);
    this.stackUpdate = 0;
    this.pendingStacks.clear();
    for (const binding of this.buttonBindings) binding.unbind();
    this.buttonBindings = [];
    this.settingsButton?.destroy();
    this.settingsButton = undefined;
    this.settingsManager.events.off(this.settingsListener);
    this.themeContext.disconnect(this.themeSignal);
    for (const [actor, signals] of this.signals) {
      for (const signal of signals) actor.disconnect(signal);
    }
    this.signals.clear();
    for (const actor of this.stackClips.keys()) this.restoreStackClip(actor);
    for (const mask of this.stackMasks.values()) mask.dispose();
    this.stackMasks.clear();
    for (const appearance of this.messages.values()) {
      this.setStackOpacity(appearance, 1);
      setNotificationBodyHidden(appearance.widgets, false);
      this.setHeaderHidden(appearance, false);
      if (appearance.widgets.body)
        appearance.widgets.body.clip_to_allocation = appearance.bodyClipped;
      for (const [widget, style] of appearance.styles) widget.set_style(style);
    }
    this.messages.clear();
  }
}
