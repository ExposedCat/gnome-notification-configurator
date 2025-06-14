# Notification Changer | GNOME Extension

A GNOME Shell extension that provides advanced notification management capabilities including rate limiting for duplicate notifications and custom color theming per application.

## Installation

### Manual Installation (Recommended)

Since this extension is not yet available on the GNOME Extensions website, you can install it manually:

1. Clone this repository:
   ```bash
   git clone https://github.com/ExposedCat/gnome-shell-notification-cleaner.git
   cd gnome-shell-notification-cleaner
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install the extension:
   ```bash
   npm run install
   ```

   This will build the extension and install it to your local GNOME Shell extensions directory (`~/.local/share/gnome-shell/extensions/`).

4. Restart GNOME Shell:
   - Log out and log back in

5. Enable the extension:
   ```bash
   gnome-extensions enable notification-configurator@exposedcat
   ```

   Or use GNOME Extensions app to enable "Notification Configurator".

### Requirements

- GNOME Shell 47 or 48
- npm

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
   - Copy metadata, schemas, and styles
   - Install to extensions directory
   - Launch nested GNOME Shell session for testing

3. **Debug the extension:**
   - Check terminal output for logs in the nested shell session
   - Access Looking Glass debugger with `Alt+F2` → `lg` for interactive debugging

### Architecture Overview

This extension consists of three main components:

1. **NotificationsManager** - Handles notification rate limiting by patching the `FdoNotificationDaemonSource.prototype.processNotification` method
2. **ThemesManager** - Applies custom colors to notifications by monitoring the message tray and dynamically styling notification elements
3. **SettingsManager** - Manages GSettings integration and provides reactive updates when settings change

### How It Works

#### Notification Rate Limiting
The extension patches GNOME Shell's notification processing system:
- Intercepts notifications via `FdoNotificationDaemonSource.prototype.processNotification`
- Tracks timing of notifications per source application
- Blocks duplicate notifications within the configured threshold (default: 5 seconds)
- Sets `notification.acknowledged = true` to prevent display of rate-limited notifications

#### Custom Theming
The theming system works by:
- Monitoring the message tray container for new notifications using the `child-added` signal
- Parsing the notification DOM structure to find text elements (app name, time, title, body)
- Applying custom CSS styles based on configured color themes per application
- Matching applications using partial string matching (case-insensitive)

#### Settings Integration
- Uses GSettings schema: `org.gnome.shell.extensions.notification-configurator`
- Provides reactive updates through a custom event emitter system
- Stores app-specific themes as JSON in GSettings
- Supports toggling features without requiring extension restart

### Available Scripts

- `npm start` - Build and run in development mode with nested GNOME Shell session
- `npm run build` - Compile TypeScript and prepare distribution files
- `npm run clean` - Remove build artifacts and dependencies
- `npm run pack` - Create ZIP package for distribution

### File Structure

```
src/
├── extension.ts          # Main extension class
├── prefs.ts             # Preferences dialog (not yet implemented)
├── utils/
│   ├── notifications.ts  # Notification rate limiting logic
│   ├── themes.ts        # Custom color theming system
│   ├── settings.ts      # GSettings management
│   └── event-emitter.ts # Type-safe event system
├── styles/
│   └── stylesheet.css   # Extension styles (currently empty)
└── types/
    ├── ambient.d.ts     # Ambient type declarations
    └── internals.d.ts   # GNOME Shell internal types
```

### Styling System

The extension applies styles by:
1. Monitoring notification container changes
2. Parsing notification DOM hierarchy:
   ```
   NotificationContainer
   └── Notification
       ├── Header
       │   ├── Icon
       │   └── Content
       │       ├── Source (app name)
       │       └── Time
       └── Content
           ├── Icon
           └── Content
               ├── Title
               └── Body
   ```
3. Applying CSS color properties to specific elements
4. Supporting both solid colors and alpha transparency

### Configuration Schema

The extension uses the following GSettings keys:
- `enable-rate-limiting` (boolean) - Toggle notification rate limiting
- `enable-custom-colors` (boolean) - Toggle custom notification colors
- `notification-threshold` (integer) - Rate limit threshold in milliseconds (100-60000)
- `app-themes` (string) - JSON mapping of app names to color themes

## License

This project is licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later).

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues on the [GitHub repository](https://github.com/ExposedCat/gnome-shell-notification-cleaner).
