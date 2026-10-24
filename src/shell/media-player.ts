import Clutter from "gi://Clutter";
import Cogl from "gi://Cogl";
import GObject from "gi://GObject";
import Gio from "gi://Gio?version=2.0";
import Shell from "gi://Shell";
import St from "gi://St";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as MessageList from "resource:///org/gnome/shell/ui/messageList.js";
import * as Mpris from "resource:///org/gnome/shell/ui/mpris.js";
import {
  MEDIA_PLAYER_LAYOUT,
  hideMediaSource,
  mediaPlayerHeight,
} from "../utils/media-player.js";
import type {
  MediaPlayerConfiguration,
  SettingsManager,
} from "../utils/settings.js";

type Player = {
  canPlay: boolean;
  source: { title: string };
  trackCoverUrl: string;
};
type MediaMessage = St.Button & {
  _update: () => void;
  _player: Player;
  _header: St.Widget;
  _icon: St.Icon;
  titleLabel: St.Label;
  _bodyLabel: St.Label;
  _mediaControls: St.BoxLayout;
};
type MediaNamespace = { MediaMessage?: { prototype: MediaMessage } };
type MediaView = St.Widget & {
  _addPlayer: (player: Player) => void;
  _removePlayer: (player: Player) => void;
  _playerToMessage: Map<Player, MediaMessage>;
  _mediaSource: { players: Player[] };
};
type MediaSection = St.Widget & {
  _sync: () => void;
  removeMessage: (message: MediaMessage, animate: boolean) => void;
};
type CalendarMessages = {
  _messageView?: MediaView;
  _mediaSection?: MediaSection;
};

function extendStyle(
  style: string | null | undefined,
  overrides: string,
): string {
  return style ? `${style.replace(/;\s*$/, "")}; ${overrides}` : overrides;
}

type SnippetEffect = Clutter.Effect & {
  set_uniform_float: (
    name: string,
    components: number,
    contents: number[],
  ) => void;
};

const CORNER_DECLARATIONS = "uniform vec3 corners;";
const CORNER_SHADER = `
  vec2 corner = abs((cogl_tex_coord_in[0].xy - 0.5) * corners.xy) - (corners.xy * 0.5 - corners.z);
  float distance = length(max(corner, 0.0)) + min(max(corner.x, corner.y), 0.0) - corners.z;
  cogl_color_out *= 1.0 - smoothstep(-1.0, 0.0, distance);
`;

const LegacyRoundedClip = Shell.GLSLEffect
  ? GObject.registerClass(
      class LegacyRoundedClip extends Shell.GLSLEffect {
        vfunc_build_pipeline() {
          this.add_glsl_snippet(
            Cogl.SnippetHook.FRAGMENT,
            CORNER_DECLARATIONS,
            CORNER_SHADER,
            false,
          );
        }
      },
    )
  : null;

class RoundedClip {
  readonly effect: Clutter.Effect;
  private dimensions = "";
  private setCorners: (corners: number[]) => void;

  constructor() {
    const shaderEffect = Clutter.ShaderEffect as typeof Clutter.ShaderEffect & {
      new_with_snippet?: (snippet: Cogl.Snippet) => SnippetEffect;
    };
    if (shaderEffect.new_with_snippet) {
      const effect = shaderEffect.new_with_snippet(
        Cogl.Snippet.new(
          Cogl.SnippetHook.FRAGMENT,
          CORNER_DECLARATIONS,
          CORNER_SHADER,
        ),
      );
      this.effect = effect;
      this.setCorners = (corners) =>
        effect.set_uniform_float("corners", 3, corners);
    } else if (LegacyRoundedClip) {
      const effect = new LegacyRoundedClip();
      this.effect = effect;
      this.setCorners = (corners) =>
        effect.set_uniform_float(
          effect.get_uniform_location("corners"),
          3,
          corners,
        );
    } else {
      throw new Error("No supported shader effect is available");
    }
    this.effect.enabled = false;
  }

  update(width: number, height: number, radius: number) {
    this.effect.enabled = width > 0 && height > 0;
    if (!this.effect.enabled) return;
    const dimensions = `${width}:${height}:${radius}`;
    if (dimensions === this.dimensions) return;
    this.dimensions = dimensions;
    this.setCorners([width, height, Math.min(radius, width / 2, height / 2)]);
    this.effect.queue_repaint();
  }
}

const MediaLayout = GObject.registerClass(
  class MediaLayout extends Clutter.BinLayout {
    foreground?: Clutter.Actor;

    vfunc_get_preferred_width(
      _container: Clutter.Actor,
      height: number,
    ): [number, number] {
      return this.foreground?.get_preferred_width(height) ?? [0, 0];
    }

    vfunc_get_preferred_height(
      _container: Clutter.Actor,
      width: number,
    ): [number, number] {
      return this.foreground?.get_preferred_height(width) ?? [0, 0];
    }
  },
);

class MediaCard {
  private foreground: St.Widget;
  private body: St.Widget;
  private controlsIndex: number;
  private controlsAlignment: Clutter.ActorAlign;
  private surface: St.Widget;
  private background = new Clutter.Actor({
    x_expand: true,
    y_expand: true,
    content_gravity: Clutter.ContentGravity.RESIZE_FILL,
  });
  private shade = new St.Widget({ x_expand: true, y_expand: true });
  private cover = new Clutter.Actor({
    x_expand: true,
    y_expand: true,
    x_align: Clutter.ActorAlign.START,
    y_align: Clutter.ActorAlign.CENTER,
  });
  private blur = new Shell.BlurEffect({
    radius: MEDIA_PLAYER_LAYOUT.blurRadius,
    brightness: 0.5,
    mode: Shell.BlurMode.ACTOR,
  });
  private clipping = new RoundedClip();
  private iconClipping = new RoundedClip();
  private coverClipping = new RoundedClip();
  private loader?: Clutter.Actor;
  private artwork = "";
  private aspectRatio = 1;
  private configuration?: MediaPlayerConfiguration;
  private styles: Map<St.Widget, string | null>;
  private expansion: Map<
    Clutter.Actor,
    { expand: boolean; align: Clutter.ActorAlign }
  >;
  private headerVisible: boolean;
  private signals: number[];
  private iconSignal: number;
  private padding = "";
  private destroyed = false;
  private removing = false;
  private allocationSignal: number;

  constructor(
    readonly message: MediaMessage,
    onDestroy: () => void,
  ) {
    this.background.set_pivot_point(0.5, 0.5);
    this.foreground = message.get_child() as St.Widget;
    const body = message._icon.get_parent() as St.Widget;
    this.body = body;
    this.controlsIndex = body.get_children().indexOf(message._mediaControls);
    this.controlsAlignment = message._mediaControls.x_align;
    this.styles = new Map(
      [
        message,
        this.foreground,
        message.titleLabel,
        message._bodyLabel,
        message._mediaControls,
      ].map((widget) => [widget, widget.get_style()]),
    );
    this.expansion = new Map(
      [this.foreground, body, message._mediaControls].map((actor) => [
        actor,
        { expand: actor.y_expand, align: actor.y_align },
      ]),
    );
    this.headerVisible = message._header.visible;
    const layout = new MediaLayout();
    layout.foreground = this.foreground;
    this.surface = new St.Widget({
      layout_manager: layout,
      clip_to_allocation: true,
    });
    message.set_child(null);
    this.surface.add_child(this.background);
    this.surface.add_child(this.shade);
    this.surface.add_child(this.cover);
    this.surface.add_child(this.foreground);
    message.set_child(this.surface);
    this.background.add_effect(this.blur);
    this.cover.add_effect(this.coverClipping.effect);
    this.surface.add_effect(this.clipping.effect);
    message._icon.add_effect(this.iconClipping.effect);
    this.foreground.y_expand = true;
    body.y_expand = true;
    body.y_align = Clutter.ActorAlign.CENTER;
    message._mediaControls.y_align = Clutter.ActorAlign.CENTER;
    this.allocationSignal = this.surface.connect("notify::allocation", () =>
      this.allocate(),
    );
    this.signals = [
      message.connect("destroy", () => {
        this.destroyed = true;
        this.loader?.destroy();
        onDestroy();
      }),
    ];
    this.iconSignal = message._icon.connect("notify::allocation", () =>
      this.iconClipping.update(
        message._icon.width,
        message._icon.height,
        MEDIA_PLAYER_LAYOUT.thumbnailRadius *
          St.ThemeContext.get_for_stage(global.stage as Clutter.Stage)
            .scale_factor,
      ),
    );
  }

  update(configuration: MediaPlayerConfiguration) {
    this.configuration = configuration;
    const { message } = this;
    message._header.visible =
      this.headerVisible &&
      !hideMediaSource(configuration, message._player.source.title);
    const originalStyle = this.styles.get(message) ?? "";
    message.set_style(
      extendStyle(originalStyle, "padding: 0; border: none; box-shadow: none;"),
    );
    message.titleLabel.set_style(
      configuration.enlarge
        ? extendStyle(
            this.styles.get(message.titleLabel),
            `font-size: ${MEDIA_PLAYER_LAYOUT.enlargedTitleSize}px;`,
          )
        : (this.styles.get(message.titleLabel) ?? null),
    );
    message._bodyLabel.set_style(
      configuration.enlarge
        ? extendStyle(
            this.styles.get(message._bodyLabel),
            `font-size: ${MEDIA_PLAYER_LAYOUT.enlargedBodySize}px;`,
          )
        : (this.styles.get(message._bodyLabel) ?? null),
    );
    this.loadArtwork(message._player.trackCoverUrl);
    this.allocate();
  }

  private loadArtwork(artwork: string) {
    if (this.artwork === artwork) return;
    this.artwork = artwork;
    this.loader?.destroy();
    this.loader = undefined;
    this.background.set_content(null);
    this.cover.set_content(null);
    this.aspectRatio = 1;
    if (!artwork) return;
    const scale = St.ThemeContext.get_for_stage(
      global.stage as Clutter.Stage,
    ).scale_factor;
    const loader = St.TextureCache.get_default().load_file_async(
      Gio.File.new_for_uri(artwork) as unknown as Parameters<
        St.TextureCache["load_file_async"]
      >[0],
      1024,
      1024,
      scale,
      this.message.get_resource_scale(),
    );
    this.loader = loader;
    const loaded = () => {
      if (this.destroyed || this.loader !== loader) return;
      const content = loader.get_content();
      if (!content) return;
      const texture = (
        content as Clutter.Content & { get_texture: () => Cogl.Texture }
      ).get_texture();
      const width = texture.get_width();
      const height = texture.get_height();
      if (width <= 0 || height <= 0) return;
      this.aspectRatio = width / height;
      this.background.content = content;
      this.cover.content = content;
      this.allocate();
    };
    loader.connect("notify::content", loaded);
    loaded();
  }

  private allocate() {
    const configuration = this.configuration;
    if (!configuration || this.destroyed || this.removing) return;
    const scale = St.ThemeContext.get_for_stage(
      global.stage as Clutter.Stage,
    ).scale_factor;
    const allocation = this.surface.get_allocation_box();
    const width = allocation.get_width();
    const height = allocation.get_height();
    const artworkReady = this.cover.content !== null;
    const bigCover = configuration.thumbnail === "big" && artworkReady;
    this.positionControls(bigCover && configuration.enlarge);
    const coverWidth = Math.min(
      height * this.aspectRatio,
      width * MEDIA_PLAYER_LAYOUT.coverMaximumWidth,
    );
    const padding = extendStyle(
      this.styles.get(this.foreground),
      `min-height: ${mediaPlayerHeight(configuration.enlarge) - MEDIA_PLAYER_LAYOUT.padding * 2}px; padding: ${MEDIA_PLAYER_LAYOUT.padding}px; padding-${this.message.get_text_direction() === Clutter.TextDirection.RTL ? "right" : "left"}: ${(bigCover ? coverWidth / scale : 0) + MEDIA_PLAYER_LAYOUT.padding}px;`,
    );
    if (padding !== this.padding) {
      this.padding = padding;
      this.foreground.set_style(padding);
    }
    this.cover.visible = bigCover;
    this.cover.x_align =
      this.message.get_text_direction() === Clutter.TextDirection.RTL
        ? Clutter.ActorAlign.END
        : Clutter.ActorAlign.START;
    this.cover.set_size(coverWidth, coverWidth / this.aspectRatio);
    this.coverClipping.update(
      coverWidth,
      coverWidth / this.aspectRatio,
      MEDIA_PLAYER_LAYOUT.coverRadius * scale,
    );
    this.message._icon.visible =
      configuration.thumbnail === "small" ||
      (configuration.thumbnail === "big" && !artworkReady);
    this.background.visible =
      configuration.background !== "empty" &&
      artworkReady &&
      width > 0 &&
      height > 0;
    this.shade.visible = this.background.visible;
    this.blur.enabled =
      configuration.background === "blurred" && this.background.visible;
    this.blur.radius = MEDIA_PLAYER_LAYOUT.blurRadius * scale;
    this.shade.set_style(
      `background-color: rgba(10,16,16,${configuration.background === "blurred" ? 0.12 : 0.6});`,
    );
    if (width > 0 && height > 0) {
      const backgroundWidth = Math.max(width, height * this.aspectRatio);
      this.background.set_scale(
        backgroundWidth / width,
        backgroundWidth / this.aspectRatio / height,
      );
      const radius = this.message
        .get_theme_node()
        .get_border_radius(St.Corner.TOPLEFT);
      this.clipping.update(width, height, radius);
    }
  }

  private positionControls(stacked: boolean) {
    const controls = this.message._mediaControls;
    const parent = stacked ? this.foreground : this.body;
    if (controls.get_parent() === parent) return;
    controls.get_parent()?.remove_child(controls);
    parent.insert_child_at_index(controls, stacked ? 2 : this.controlsIndex);
    controls.x_align = stacked
      ? Clutter.ActorAlign.START
      : this.controlsAlignment;
    controls.set_style(
      stacked
        ? extendStyle(
            this.styles.get(controls),
            `spacing: ${MEDIA_PLAYER_LAYOUT.controlSpacing}px;`,
          )
        : (this.styles.get(controls) ?? null),
    );
  }

  prepareRemoval() {
    this.removing = true;
    this.blur.enabled = false;
  }

  dispose() {
    if (this.destroyed) return;
    this.loader?.destroy();
    for (const signal of this.signals) this.message.disconnect(signal);
    this.message._icon.disconnect(this.iconSignal);
    this.message._icon.remove_effect(this.iconClipping.effect);
    this.positionControls(false);
    this.surface.disconnect(this.allocationSignal);
    this.surface.remove_child(this.foreground);
    this.message.set_child(null);
    this.message.set_child(this.foreground);
    this.surface.destroy();
    for (const [widget, style] of this.styles) widget.set_style(style);
    for (const [actor, expansion] of this.expansion) {
      actor.y_expand = expansion.expand;
      actor.y_align = expansion.align;
    }
    this.message._header.visible = this.headerVisible;
    this.message._update();
    this.destroyed = true;
  }
}

export class MediaPlayerManager {
  private injectionManager = new InjectionManager();
  private cards = new Map<MediaMessage, MediaCard>();
  private pending = new Map<MediaMessage, number[]>();
  private settingsListener: number;
  private calendar = (
    Main.panel.statusArea.dateMenu as unknown as {
      _messageList: CalendarMessages;
    }
  )._messageList;

  constructor(private settingsManager: SettingsManager) {
    const mediaMessage =
      (MessageList as unknown as MediaNamespace).MediaMessage ??
      (Mpris as unknown as MediaNamespace).MediaMessage;
    if (mediaMessage) {
      const manager = this;
      this.injectionManager.overrideMethod(
        mediaMessage.prototype,
        "_update",
        (original) =>
          function (this: MediaMessage) {
            original.call(this);
            manager.update(this);
          },
      );
    }
    const view = this.calendar._messageView;
    if (view) {
      const manager = this;
      this.injectionManager.overrideMethod(
        Object.getPrototypeOf(view) as MediaView,
        "_removePlayer",
        (original) =>
          function (this: MediaView, player: Player) {
            const message = this._playerToMessage.get(player);
            if (message) manager.cards.get(message)?.prepareRemoval();
            original.call(this, player);
          },
      );
      this.injectionManager.overrideMethod(
        Object.getPrototypeOf(view) as MediaView,
        "_addPlayer",
        (original) => {
          return function (this: MediaView, player: Player) {
            if (settingsManager.mediaPlayer?.enabled !== false)
              original.call(this, player);
          };
        },
      );
    }
    const section = this.calendar._mediaSection;
    if (section) {
      const manager = this;
      this.injectionManager.overrideMethod(
        Object.getPrototypeOf(section) as MediaSection,
        "_sync",
        (original) =>
          function (this: MediaSection) {
            original.call(this);
            this.visible &&= settingsManager.mediaPlayer?.enabled !== false;
          },
      );
      this.injectionManager.overrideMethod(
        Object.getPrototypeOf(section) as MediaSection,
        "removeMessage",
        (original) =>
          function (
            this: MediaSection,
            message: MediaMessage,
            animate: boolean,
          ) {
            manager.cards.get(message)?.prepareRemoval();
            original.call(this, message, animate);
          },
      );
    }
    this.settingsListener = settingsManager.events.on(
      "mediaPlayerChanged",
      () => this.refresh(),
    );
    this.refresh();
  }

  private update(message: MediaMessage) {
    const configuration = this.settingsManager.mediaPlayer;
    if (!configuration) return;
    if (!message.get_stage()) {
      if (!this.pending.has(message)) {
        const signals = [
          message.connect("notify::mapped", () => {
            if (!message.mapped) return;
            for (const signal of this.pending.get(message) ?? [])
              message.disconnect(signal);
            this.pending.delete(message);
            this.update(message);
          }),
          message.connect("destroy", () => this.pending.delete(message)),
        ];
        this.pending.set(message, signals);
      }
      return;
    }
    let card = this.cards.get(message);
    if (!card) {
      card = new MediaCard(message, () => this.cards.delete(message));
      this.cards.set(message, card);
    }
    card.update(configuration);
  }

  private refresh() {
    const configuration = this.settingsManager.mediaPlayer;
    this.calendar._mediaSection?._sync();
    const view = this.calendar._messageView;
    if (view) {
      if (configuration?.enabled === false) {
        for (const player of [...view._playerToMessage.keys()])
          view._removePlayer(player);
      } else {
        for (const player of view._mediaSource.players) {
          if (player.canPlay && !view._playerToMessage.has(player))
            view._addPlayer(player);
        }
      }
    }
    const visit = (actor: Clutter.Actor) => {
      if (
        actor instanceof St.Widget &&
        actor.has_style_class_name("media-message")
      ) {
        const message = actor as MediaMessage;
        if (configuration) {
          this.update(message);
        } else {
          this.cards.get(message)?.dispose();
          this.cards.delete(message);
        }
      }
      for (const child of actor.get_children()) visit(child);
    };
    visit(Main.panel.statusArea.dateMenu.menu.actor);
    if (!configuration) {
      for (const card of this.cards.values()) card.dispose();
      this.cards.clear();
    }
  }

  dispose() {
    this.settingsManager.events.off(this.settingsListener);
    this.injectionManager.clear();
    this.calendar._mediaSection?._sync();
    for (const [message, signals] of this.pending) {
      for (const signal of signals) message.disconnect(signal);
    }
    this.pending.clear();
    for (const card of this.cards.values()) card.dispose();
    this.cards.clear();
    const view = this.calendar._messageView;
    if (view) {
      for (const player of view._mediaSource.players) {
        if (player.canPlay && !view._playerToMessage.has(player))
          view._addPlayer(player);
      }
    }
  }
}
