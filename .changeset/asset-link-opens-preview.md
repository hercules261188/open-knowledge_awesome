---
"@inkeep/open-knowledge": patch
---

Clicking a link to a non-markdown file (HTML, archives, Office docs, and other non-viewable types) now opens the same in-app preview the sidebar shows when you select that file, instead of handing the file straight to the operating system.

Previously, once these links resolved, a bare click immediately delegated to the OS (or, for HTML and other scripted types the desktop app refuses to open directly, revealed the file in Finder). A click now lands on the file's preview screen — for non-viewable types that screen offers "Open file" and "Open with built-in text editor" — so the behavior matches selecting the file in the sidebar. Cmd/Ctrl/middle-click still opens the file in the OS default app (desktop) or a new tab (web) as an escape hatch.
