<h1 align="center">
	<img style="width:64px" src="./assets/logo.png" alt="Logo"><br>
  GNOME Notification Configurator<br>
  <img style="width:512px" src="./assets/preview.png" alt="Screenshot">
</h1>
<p align="center"><strong>Advanced GNOME notification capabilities including rate limiting, custom color theming per application, and notification positioning</strong></p>

<div align="center">

<a href="https://coff.ee/exposedcat" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>

[![](https://img.shields.io/badge/author%20blog%20on-Telegram-informational?style=for-the-badge&logo=telegram&logoColor=26A5E4&color=26A5E4)](https://t.me/ExposedCatDev)
[![](https://img.shields.io/badge/author-Reddit-informational?style=for-the-badge&logo=reddit&logoColor=FF5700&color=FF5700)](https://www.reddit.com/user/ExposedCatDev)

</div>

<br>

## Features

- **Global and Pattern-Based Rules** - Configure default behavior globally or
  create enabled/disabled per-pattern overrides matched by case-insensitive
  regular expressions for app name, title, and body text
- **Notification Filtering** - Hide or close matching notifications before they
  appear
- **Notification Rate Limiting** - Hide or close frequent notifications from the
  same application within a configurable time threshold
- **Notification Center Controls** - Disable stacking for matching
  notifications and set how many notifications are kept per source
- **Visible Notifications** - Set the maximum visible notifications to `1` for
  standard single-notification behavior or `2` or more to show multiple banners with
  upward or downward stacking, globally or for matching patterns. Each monitor
  and position has its own stack; additional banners wait for a free space.
  Rules sharing a stack use the smallest visible-notification limit
- **Notification Timeout** - Configure auto-dismiss timing, keep notifications
  visible while idle, or set timeout to `0` to keep notifications until dismissed
- **Urgency Control** - Force notifications to normal urgency when needed
- **Notification Sound** - Choose an Ogg or WAV audio file, or use the sound
  theme's notification sound when an application supplies none, globally or for
  matching patterns, while respecting application sound preferences and Do Not
  Disturb. Missing or unreadable custom files fall back to the theme sound
- **Window Attention Handling** - Activate attention-requesting windows instead
  of showing a notification
- **Fullscreen Notifications** - Enable or disable notifications while
  applications are running in fullscreen mode
- **Notification Positioning** - Set horizontal alignment (fill, left, center,
  right) and vertical alignment (fill, top, center, bottom)
- **Notification Monitor** - Follow the top bar or choose a display, with automatic
  fallback to the main monitor while the chosen display is unavailable and
  restoration when it returns
- **Custom Appearance** - Hide the app title/time row, customize background,
  title, body, app name, and time colors, and adjust text sizes
- **Media Player Appearance** - Configure notification-center media cards with
  enlarged text, dimmed or blurred artwork backgrounds, rounded small or
  full-height covers, and source-title visibility with optional regex matching
- **Custom Margins** - Add top, bottom, left, and right notification margins
- **Configuration Sync** - Export globals and patterns to a JSON file, or import
  selected entries. Expand conflicts to preserve individual non-default settings;
  patterns with identical app name, title, and body matchers are merged in place
- **Test Notifications** - Send sample notifications from the preferences window
  to preview matching and styling changes

## Installation

### Extension Manager (Recommended)

- Install
  [Extension Manager](https://flathub.org/apps/com.mattjakeman.ExtensionManager)
- Search For `Notification Configurator` in `Browse` tab
- Select the extension and click `Install`

### GNOME Extenssions Website

<a href="https://extensions.gnome.org/extension/8249/notification-configurator/">
  <!-- Button SVG by Just Perfection developer -->
  <img src="./assets/download-from-ego.svg" height="80">
</a>

### Manual Installation

If latest version of the extension is not yet available on the GNOME Extensions
website, you can install it manually:

1. Clone this repository:
   ```bash
   git clone https://github.com/ExposedCat/gnome-notification-configurator.git
   cd gnome-notification-configurator
   ```

2. Install the extension:
   ```bash
   npm run install:local
   ```

   This will build the extension and install it to your local GNOME Shell
   extensions directory (`~/.local/share/gnome-shell/extensions/`).

3. Restart GNOME Shell:
   - Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable notification-configurator@exposedcat
   ```

   Or use Extensions Manager app to enable "Notification Configurator".

## Development

### Development Workflow

1. **Setup development environment:**
   ```bash
   npm install
   ```

2. **Start development session:**
   ```bash
   npm start
   # Or in a container
   npm run start:container
   ```
   This will:
   - Compile TypeScript sources
   - Install to extensions directory
   - Launch nested GNOME Shell session for testing

3. **Debug the extension:**
   - Check terminal output for logs in the nested shell session
   - Access Looking Glass debugger with `Alt+F2` → `lg` for interactive
     debugging

### Static Analysis Before Uploading

Install [Shexli](https://pypi.org/project/shexli/) in a virtual environment using
Python 3.12 or newer:

```bash
python3 -m venv venv
venv/bin/python -m pip install -r requirements-shexli.txt
```

Build, remove compiled schemas from the package, and analyze the upload ZIP:

```bash
npm run build
npm run cleanup
npm run pack
npm run check:shexli
```

CI runs the same scan after packaging and before uploading artifacts or creating
a release. The check fails on errors and warnings and displays manual review
findings. It allows Shexli 0.2.1's `EGO-M-004` false positive only when
`shell-version` includes GNOME 51 and contains exclusively stable versions from
40 through 51. The exception remains visible in the output; invalid versions,
versions above 51, and other errors still fail the check. Tree-sitter is pinned to
0.25.2 because 0.26.0 crashes during analysis.

## Translations

To add translations for the extension:

1. **Create a new translation file:**
   ```bash
   cp po/main.pot po/langcode.po
   ```
   Replace `langcode` with your language code (e.g., `po/uk.po` for Ukrainian).

2. **Edit the translation file:** Use
   [Gtranslator](https://flathub.org/apps/details/org.gnome.Gtranslator) or
   [POEdit](https://flathub.org/apps/details/net.poedit.Poedit) to edit the
   created file and make translations.

3. **Update translations when needed:** In case new labels were added or
   original labels changed, run:
   ```bash
   npm run translate
   ```
   Then update your translations if needed.

## License

This project is licensed under the GNU General Public License v3.0 or later
(GPL-3.0-or-later).

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open
issues on the
[GitHub repository](https://github.com/ExposedCat/gnome-shell-notification-cleaner).
