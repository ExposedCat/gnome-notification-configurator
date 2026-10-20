import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";

export class SectionedPreferences {
  readonly page: Adw.PreferencesPage;
  private readonly stack = new Gtk.Stack({
    hexpand: true,
    vexpand: true,
    hhomogeneous: false,
    vhomogeneous: false,
  });
  private readonly sections = new Map<string, Adw.PreferencesPage>();
  private readonly rows = new Map<Gtk.ListBoxRow, Adw.PreferencesPage>();
  private readonly navigation = new Gtk.ListBox({
    css_classes: ["navigation-sidebar"],
    selection_mode: Gtk.SelectionMode.SINGLE,
  });

  constructor(properties: Partial<Adw.PreferencesPage.ConstructorProps> = {}) {
    this.page = new Adw.PreferencesPage(properties);
    this.navigation.connect("row-selected", (_navigation, row) => {
      const section = row ? this.rows.get(row) : undefined;
      if (section) this.stack.set_visible_child(section);
    });
    const sidebar = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      width_request: 240,
      css_classes: ["sidebar-pane"],
      child: this.navigation,
    });
    const layout = new Gtk.Box({ vexpand: true });
    layout.append(sidebar);
    layout.append(new Gtk.Separator());
    layout.append(this.stack);
    const group = new Adw.PreferencesGroup({ vexpand: true });
    group.add(layout);
    this.page.add(group);
    const clamp = layout.get_ancestor(Adw.Clamp.$gtype) as Adw.Clamp | null;
    clamp?.set_maximum_size(GLib.MAXINT32);
    clamp?.set_tightening_threshold(GLib.MAXINT32);
    const container = group.get_parent();
    if (container) {
      container.add_css_class("notification-configurator-sections");
      const provider = new Gtk.CssProvider();
      provider.load_from_data(
        ".notification-configurator-sections { margin: 0; border-spacing: 0; }",
        -1,
      );
      container
        .get_style_context()
        .add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    }
  }

  add(
    group: Adw.PreferencesGroup,
    iconName: string,
    title = group.get_title(),
  ) {
    let section = this.sections.get(title);
    if (!section) {
      section = new Adw.PreferencesPage();
      this.sections.set(title, section);
      this.stack.add_titled(section, title, title);
      const content = new Gtk.Box({ spacing: 12 });
      content.append(new Gtk.Image({ icon_name: iconName }));
      content.append(new Gtk.Label({ label: title, xalign: 0, hexpand: true }));
      const row = new Gtk.ListBoxRow({ child: content });
      this.rows.set(row, section);
      this.navigation.append(row);
      if (this.rows.size === 1) this.navigation.select_row(row);
    }
    section.add(group);
  }
}
