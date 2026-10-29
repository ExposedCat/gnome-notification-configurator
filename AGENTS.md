# Project
- GNOME Shell Extension
- Uses @girs with TypeScript

# Instructions
- Never add comments to the codebase except biome-ignore
- Never add any test files
- Always write type-safe, mindful, production-ready and concise code
- Always use `type` instead of `interface`
- Always revise and cleanup code after you finish
- Never use single-letter or shortened variable names
- Don't add redundant parts to names. No `*Func`, `*Value` or whatever similar obvious names
- Always use new standards such as `for of` instead of `forEach`
- Don't use dynamic inline imports

# General rules
- Follow the official [GNOME Shell extension guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) and [best practices](https://gjs.guide/extensions/review-guidelines/best-practices.html).
- Keep changes focused and diffs small; avoid unrelated refactors, formatting changes, and unnecessary lifecycle checks or signal connections.
- Do not use destroyed or enabled boolean flags to guard lifecycle calls. Disconnect callbacks and cancel pending work during cleanup, then release destroyed instances and never reuse them.
- Each class must clean up its own signals, sources, asynchronous operations, and resources. Remove sources and disconnect signals before destroying resources; call `super.destroy()` last when applicable.
- Never disable selectively or skip required cleanup. Every `disable()` must undo all changes made by `enable()`, including when the session mode changes.
- Do not specify versions in GNOME Shell runtime GI imports; use the library versions loaded by Shell.
