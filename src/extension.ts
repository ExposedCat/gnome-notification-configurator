import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class GnomeShellExtension extends Extension {
	enable() {
		console.log('GnomeShellExtension | enabled');
	}

	disable() {
		console.log('GnomeShellExtension | disabled');
	}
}
