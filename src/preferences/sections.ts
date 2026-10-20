import Adw from "gi://Adw";
import Gtk from "gi://Gtk";

export class SectionedPreferences {
  readonly page: Adw.PreferencesPage;
  private readonly stack = new Gtk.Stack({
    hexpand: true,
    vexpand: true,
    width_request: 560,
    hhomogeneous: false,
    vhomogeneous: false,
  });
  private readonly sections = new Map<string, Adw.PreferencesPage>();

  constructor(properties: Partial<Adw.PreferencesPage.ConstructorProps> = {}) {
    this.page = new Adw.PreferencesPage(properties);
    const sidebar = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      width_request: 200,
      child: new Gtk.StackSidebar({ stack: this.stack }),
    });
    const layout = new Gtk.Box({ vexpand: true });
    layout.append(sidebar);
    layout.append(new Gtk.Separator());
    layout.append(this.stack);
    const group = new Adw.PreferencesGroup({ vexpand: true });
    group.add(layout);
    this.page.add(group);
  }

  add(group: Adw.PreferencesGroup, title = group.get_title()) {
    let section = this.sections.get(title);
    if (!section) {
      section = new Adw.PreferencesPage();
      this.sections.set(title, section);
      this.stack.add_titled(section, title, title);
    }
    section.add(group);
  }
}
