# Commit Convention Guide

This project uses **Conventional Commits** to automatically generate changelogs and releases.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

| Type | Description | Changelog Section |
|------|-------------|-------------------|
| `feat` | New features | 🚀 Features |
| `fix` | Bug fixes | 🐛 Bug Fixes |
| `docs` | Documentation changes | 📚 Documentation |
| `style` | Code style changes (formatting, etc.) | 🔧 Maintenance |
| `refactor` | Code refactoring | 🔧 Maintenance |
| `test` | Adding or updating tests | 🔧 Maintenance |
| `chore` | Build process, tooling, dependencies | 🔧 Maintenance |
| `ci` | CI/CD changes | 🔧 Maintenance |

## Breaking Changes

Add `!` after the type to indicate breaking changes:
```
feat!: remove deprecated notification API
```

## Examples

### Features
```
feat: add notification rate limiting
feat(ui): add custom color theme picker
feat(settings): implement notification positioning controls
```

### Bug Fixes
```
fix: resolve memory leak in notification cleanup
fix(themes): correct color inheritance for dark mode
fix(positioning): fix notifications overlapping on dual monitors
```

### Documentation
```
docs: update installation instructions
docs(api): add JSDoc comments for notification utils
```

### Maintenance
```
chore: update dependencies to latest versions
refactor: simplify notification filtering logic
test: add unit tests for theme utilities
ci: add automated testing workflow
```

### Breaking Changes
```
feat!: change notification API to use async/await
fix!: remove support for GNOME Shell 45
```

## Scopes (Optional)

Use scopes to specify what part of the codebase is affected:

- `ui` - User interface changes
- `settings` - Settings/preferences related
- `themes` - Color themes and styling
- `notifications` - Core notification logic
- `positioning` - Notification positioning
- `filtering` - Notification filtering
- `api` - API changes
- `deps` - Dependencies

## Benefits

✅ **Automatic Changelog** - Commits are automatically categorized and formatted  
✅ **Clear History** - Easy to understand what each commit does  
✅ **Automated Releases** - Semantic versioning based on commit types  
✅ **Better Collaboration** - Consistent commit messages across contributors  

## Tools

- **Commitizen**: `npm install -g commitizen cz-conventional-changelog`
- **Conventional Changelog**: Automatically generates CHANGELOG.md
- **Semantic Release**: Automates version bumping and releases

## Quick Reference

```bash
# Features
git commit -m "feat: add new notification sound options"

# Bug fixes  
git commit -m "fix: resolve notification positioning on ultrawide monitors"

# Breaking changes
git commit -m "feat!: migrate to new GNOME Shell extension API"

# With scope
git commit -m "feat(themes): add high contrast theme support"
```

Remember: The first line should be **under 72 characters** and use **imperative mood** (e.g., "add" not "added").