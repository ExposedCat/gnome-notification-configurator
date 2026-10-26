import type Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

const NotificationSlot = GObject.registerClass(
  class NotificationSlot extends St.Widget {
    banner?: St.Widget;

    vfunc_get_preferred_width(height: number): [number, number] {
      const banner = this.banner;
      const child = banner?.get_first_child();
      if (!banner || !child) return [0, 0];
      const node = banner.get_theme_node();
      const horizontal =
        node.get_margin(St.Side.LEFT) + node.get_margin(St.Side.RIGHT);
      const vertical =
        node.get_margin(St.Side.TOP) + node.get_margin(St.Side.BOTTOM);
      const [minimum, natural] = node.adjust_preferred_width(
        ...child.get_preferred_width(
          node.adjust_for_height(
            height < 0 ? height : Math.max(0, height - vertical),
          ),
        ),
      );
      return [minimum + horizontal, natural + horizontal];
    }

    vfunc_get_preferred_height(width: number): [number, number] {
      const banner = this.banner;
      const child = banner?.get_first_child();
      if (!banner || !child) return [0, 0];
      const node = banner.get_theme_node();
      const horizontal =
        node.get_margin(St.Side.LEFT) + node.get_margin(St.Side.RIGHT);
      const vertical =
        node.get_margin(St.Side.TOP) + node.get_margin(St.Side.BOTTOM);
      const [minimum, natural] = node.adjust_preferred_height(
        ...child.get_preferred_height(
          node.adjust_for_width(
            width < 0 ? width : Math.max(0, width - horizontal),
          ),
        ),
      );
      return [minimum + vertical, natural + vertical];
    }

    vfunc_allocate(allocation: Clutter.ActorBox) {
      this.set_allocation(allocation);
      const banner = this.banner;
      if (!banner?.get_parent() || this.width <= 0 || this.height <= 0) return;
      const [horizontal, vertical] = this.get_transformed_position();
      const [success, relativeHorizontal, relativeVertical] =
        Main.uiGroup.transform_stage_point(horizontal, vertical);
      if (!success) return;
      banner.set_position(relativeHorizontal, relativeVertical);
      banner.set_size(this.width, this.height);
    }
  },
);

export function createNotificationSlot(actor: St.Widget) {
  const slot = new NotificationSlot({ reactive: false, x_expand: true });
  slot.banner = actor;
  const child = actor.get_first_child();
  const relayout = child?.connect("queue-relayout", () =>
    slot.queue_relayout(),
  );
  slot.connect("destroy", () => {
    if (relayout) child?.disconnect(relayout);
    slot.banner = undefined;
  });
  return slot;
}
