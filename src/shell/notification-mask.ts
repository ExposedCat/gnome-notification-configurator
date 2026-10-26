import Clutter from "gi://Clutter";
import Cogl from "gi://Cogl";
import GObject from "gi://GObject";
import Graphene from "gi://Graphene";
import St from "gi://St";

type Geometry = {
  rectangle: number[];
  corners: number[];
  scale: number[];
};

type Target = {
  context: Cogl.Context;
  width: number;
  height: number;
  framebuffer: Cogl.Offscreen;
  pipeline: Cogl.Pipeline;
  locations: Map<string, number>;
};

function shader(capacity: number) {
  let declarations =
    "uniform float dimensions_0; uniform float dimensions_1; uniform float cover_count_0;";
  let source = "";
  for (let index = 0; index < capacity; index++) {
    for (const [name, components] of [
      ["rectangle", 4],
      ["corners", 4],
      ["scale", 2],
    ] as const)
      for (let component = 0; component < components; component++)
        declarations += `uniform float ${name}${index}_${component};`;
    source += `
      if (cover_count_0 > ${index}.5) {
        vec4 rectangle = vec4(rectangle${index}_0, rectangle${index}_1, rectangle${index}_2, rectangle${index}_3);
        vec4 corners = vec4(corners${index}_0, corners${index}_1, corners${index}_2, corners${index}_3);
        vec2 scale = vec2(scale${index}_0, scale${index}_1);
        vec2 position = (cogl_tex_coord_in[0].xy * vec2(dimensions_0, dimensions_1) - rectangle.xy) / scale;
        vec2 half_size = rectangle.zw / (2.0 * scale);
        float radius = position.y < half_size.y
          ? (position.x < half_size.x ? corners.x : corners.y)
          : (position.x < half_size.x ? corners.w : corners.z);
        vec2 edge = abs(position - half_size) - half_size + radius;
        float distance = length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - radius;
        cogl_color_out *= smoothstep(-0.5, 0.5, distance * min(scale.x, scale.y));
      }
    `;
  }
  return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, declarations, source);
}

const MaskEffect = GObject.registerClass(
  { GTypeName: "GncNotificationMaskEffect" },
  class MaskEffect extends Clutter.Effect {
    capacity = 1;
    private target?: Target;
    private uniforms = new Map<string, number>();
    private uniformsDirty = true;
    private sourceValid = false;

    setUniform(name: string, contents: number[]) {
      for (const [index, content] of contents.entries())
        this.uniforms.set(`${name}_${index}`, content);
      this.uniformsDirty = true;
    }

    vfunc_paint(
      node: Clutter.PaintNode,
      context: Clutter.PaintContext,
      flags: Clutter.EffectPaintFlags,
    ) {
      const actor = this.get_actor();
      if (flags & Clutter.EffectPaintFlags.BYPASS_EFFECT) {
        node.add_child(Clutter.ActorNode.new(actor, -1));
        this.sourceValid = false;
        return;
      }
      const clip = actor.has_clip ? actor.get_clip() : null;
      if (
        actor.width <= 0 ||
        actor.height <= 0 ||
        (clip && (clip[2] <= 0 || clip[3] <= 0))
      ) {
        this.sourceValid = false;
        return;
      }
      const graphics = context.get_framebuffer().get_context();
      const scale = actor.get_resource_scale();
      const width = Math.max(1, Math.ceil(actor.width * scale));
      const height = Math.max(1, Math.ceil(actor.height * scale));
      if (
        !this.target ||
        this.target.context !== graphics ||
        this.target.width !== width ||
        this.target.height !== height
      ) {
        const texture = Cogl.Texture2D.new_with_size(graphics, width, height);
        texture.set_components(Cogl.TextureComponents.RGBA);
        texture.allocate();
        const framebuffer = Cogl.Offscreen.new_with_texture(texture);
        framebuffer.allocate();
        framebuffer.set_modelview_matrix(new Graphene.Matrix().init_identity());
        const pipeline = Cogl.Pipeline.new(graphics);
        pipeline.set_blend(
          "RGBA = ADD (SRC_COLOR, DST_COLOR * (1-SRC_COLOR[A]))",
        );
        pipeline.set_layer_texture(0, texture);
        pipeline.set_layer_filters(
          0,
          Cogl.PipelineFilter.LINEAR,
          Cogl.PipelineFilter.LINEAR,
        );
        pipeline.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
        pipeline.add_snippet(shader(this.capacity));
        this.target = {
          context: graphics,
          width,
          height,
          framebuffer,
          pipeline,
          locations: new Map(),
        };
        this.uniformsDirty = true;
        this.sourceValid = false;
      }
      const { framebuffer, pipeline, locations } = this.target;
      framebuffer.set_viewport(0, 0, width, height);
      framebuffer.orthographic(0, 0, actor.width, actor.height, -1, 1);
      if (this.uniformsDirty) {
        for (const [name, contents] of this.uniforms) {
          let location = locations.get(name);
          if (location === undefined) {
            location = pipeline.get_uniform_location(name);
            locations.set(name, location);
          }
          pipeline.set_uniform_1f(location, contents);
        }
        this.uniformsDirty = false;
      }
      if (!this.sourceValid || flags & Clutter.EffectPaintFlags.ACTOR_DIRTY) {
        const layer = Clutter.LayerNode.new_to_framebuffer(
          framebuffer,
          pipeline,
        );
        layer.add_child(Clutter.ActorNode.new(actor, 255));
        node.add_child(layer);
        this.sourceValid = true;
      }
      const opacity = actor.get_paint_opacity() / 255;
      const color = new Cogl.Color();
      color.init_from_4f(opacity, opacity, opacity, opacity);
      pipeline.set_color(color);
      const output = Clutter.PipelineNode.new(pipeline);
      output.add_rectangle(
        new Clutter.ActorBox({
          x1: 0,
          y1: 0,
          x2: actor.width,
          y2: actor.height,
        }),
      );
      node.add_child(output);
    }

    vfunc_set_actor(actor: Clutter.Actor | null) {
      this.target = undefined;
      this.sourceValid = false;
      super.vfunc_set_actor(actor);
    }
  },
);

function geometry(actor: Clutter.Actor, cover: St.Widget): Geometry | null {
  if (!actor.has_allocation() || !cover.has_allocation() || !cover.visible)
    return null;
  const [horizontal, vertical] = cover.get_transformed_position();
  const [width, height] = cover.get_transformed_size();
  const [originTransformed, left, top] = actor.transform_stage_point(
    horizontal,
    vertical,
  );
  const [endTransformed, right, bottom] = actor.transform_stage_point(
    horizontal + width,
    vertical + height,
  );
  if (
    !originTransformed ||
    !endTransformed ||
    right <= left ||
    bottom <= top ||
    left >= actor.width ||
    top >= actor.height ||
    right <= 0 ||
    bottom <= 0 ||
    cover.width <= 0 ||
    cover.height <= 0
  )
    return null;
  const node = cover.get_theme_node();
  return {
    rectangle: [left, top, right - left, bottom - top],
    scale: [(right - left) / cover.width, (bottom - top) / cover.height],
    corners: [
      St.Corner.TOPLEFT,
      St.Corner.TOPRIGHT,
      St.Corner.BOTTOMRIGHT,
      St.Corner.BOTTOMLEFT,
    ].map((corner) =>
      Math.min(
        node.get_border_radius(corner),
        cover.width / 2,
        cover.height / 2,
      ),
    ),
  };
}

export class NotificationMask {
  private effect?: InstanceType<typeof MaskEffect>;
  private capacity = 0;
  private dimensions = "";
  private clipping: boolean;

  constructor(private actor: Clutter.Actor) {
    this.clipping = actor.clip_to_allocation;
  }

  private create(capacity: number) {
    if (this.effect) this.actor.remove_effect(this.effect);
    this.effect = new MaskEffect();
    this.effect.capacity = capacity;
    this.capacity = capacity;
    this.dimensions = "";
    this.actor.add_effect(this.effect);
  }

  update(covers: St.Widget[]) {
    const shapes = covers
      .map((cover) => geometry(this.actor, cover))
      .filter((shape) => shape !== null);
    if (shapes.length === 0) {
      if (this.effect) this.effect.enabled = false;
      this.actor.clip_to_allocation = this.clipping;
      return;
    }
    if (shapes.length > this.capacity)
      this.create(2 ** Math.ceil(Math.log2(shapes.length)));
    this.actor.clip_to_allocation = true;
    if (this.effect) this.effect.enabled = true;
    const dimensions = JSON.stringify([
      this.actor.width,
      this.actor.height,
      shapes,
    ]);
    if (dimensions === this.dimensions) return;
    this.dimensions = dimensions;
    this.effect?.setUniform("dimensions", [
      this.actor.width,
      this.actor.height,
    ]);
    this.effect?.setUniform("cover_count", [shapes.length]);
    for (const [index, shape] of shapes.entries()) {
      this.effect?.setUniform(`rectangle${index}`, shape.rectangle);
      this.effect?.setUniform(`corners${index}`, shape.corners);
      this.effect?.setUniform(`scale${index}`, shape.scale);
    }
    this.effect?.queue_repaint();
  }

  dispose() {
    if (this.effect) this.actor.remove_effect(this.effect);
    this.actor.clip_to_allocation = this.clipping;
  }
}
