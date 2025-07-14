<h1 align="center">
	<img style="width:64px" src="./assets/logo.png" alt="Logo"><br>
  GNOME Notification Configurator<br>
  <img style="width:512px" src="./assets/preview.png" alt="Screenshot">
</h1>
<p align="center"><strong>Advanced GNOME notification capabilities including rate limiting, custom color theming per application, and notification positioning</strong></p>

<div align="center">

  [![](https://img.shields.io/badge/author%20blog%20on-Telegram-informational?style=for-the-badge&logo=telegram&logoColor=26A5E4&color=26A5E4)](https://t.me/ExposedCatDev)
  [![](https://img.shields.io/badge/author-Reddit-informational?style=for-the-badge&logo=reddit&logoColor=FF5700&color=FF5700)](https://www.reddit.com/user/ExposedCatDev)
</div>

<br>

## Features

- **Notification Rate Limiting** - Prevent frequent notifications from the same app within a configurable time threshold
- **Notification Filtering** - Block or hide unwanted notifications using regular expressions to match title, body text, or application name
- **Custom Color Themes** - Set custom colors for notifications per application using app names or RegExp patterns (background, title, body, app name, time)
- **Notification Positioning** - Control where notifications appear on screen (fill, left, center, right)
- **Fullscreen Notifications** - Enable or disable notifications when applications are running in fullscreen mode
- **Test Notifications** - Send test notifications to preview your settings instantly
- **Real-time Configuration** - Changes take effect immediately without requiring restarts

## Installation

### Extension Manager (Recommended)
- Install [Extension Manager](https://flathub.org/apps/com.mattjakeman.ExtensionManager)
- Search For `Notification Configurator` in `Browse` tab
- Select the extension and click `Install`

### GNOME Extenssions Website
<a href="https://extensions.gnome.org/extension/8249/notification-configurator/">
  <!-- Button SVG by Just Perfection developer -->
  <img src="./assets/download-from-ego.svg" height="80">
</a>

### Manual Installation

Since this extension is not yet available on the GNOME Extensions website, you can install it manually:

1. Clone this repository:
   ```bash
   git clone https://github.com/ExposedCat/gnome-notification-configurator.git
   cd gnome-notification-configurator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install the extension:
   ```bash
   npm run inject
   ```

   This will build the extension and install it to your local GNOME Shell extensions directory (`~/.local/share/gnome-shell/extensions/`).

4. Restart GNOME Shell:
   - Log out and log back in

5. Enable the extension:
   ```bash
   gnome-extensions enable notification-configurator@exposedcat
   ```

   Or use GNOME Extensions app to enable "Notification Configurator".

## Development

### Development Workflow

1. **Setup development environment:**
   ```bash
   npm install
   ```

2. **Start development session:**
   ```bash
   npm start
   ```
   This will:
   - Compile TypeScript sources
   - Install to extensions directory
   - Launch nested GNOME Shell session for testing

3. **Debug the extension:**
   - Check terminal output for logs in the nested shell session
   - Access Looking Glass debugger with `Alt+F2` → `lg` for interactive debugging

## Translations

To add translations for the extension:

1. **Create a new translation file:**
   ```bash
   cp po/main.pot po/langcode.po
   ```
   Replace `langcode` with your language code (e.g., `po/uk.po` for Ukrainian).

2. **Edit the translation file:**
   Use [Gtranslator](https://flathub.org/apps/details/org.gnome.Gtranslator) or [POEdit](https://flathub.org/apps/details/net.poedit.Poedit) to edit the created file and make translations.

3. **Update translations when needed:**
   In case new labels were added or original labels changed, run:
   ```bash
   npm run translate
   ```
   Then update your translations if needed.

## License

This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later).

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues on the [GitHub repository](https://github.com/ExposedCat/gnome-shell-notification-cleaner).
