---
"@inkeep/open-knowledge": patch
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
"@inkeep/open-knowledge-desktop": patch
---

Fix the project switcher in the sidebar footer not opening in the macOS desktop app. Clicking it showed a press state but the dropdown never opened. A Radix tooltip recently added to the trigger (to show the project path on hover) interfered with the menu on the desktop host: once the tooltip had opened on hover, clicking the trigger raced the tooltip's teardown against the menu's open, so the menu never stayed open. The trigger no longer uses a Radix tooltip — the full project path is shown via a native tooltip instead — and the menu opens reliably.
