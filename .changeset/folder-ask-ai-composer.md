---
"@inkeep/open-knowledge-app": minor
---

Add the bottom "Ask AI" composer to the folder overview page. Opening a folder now shows the same desktop composer that the editor has, docked below the file list and scoped to that folder: the folder is its top-row context chip and the dispatch lead, so a typed instruction hands off as "work on the `<folder>` folder" (with any extra `@`-mentions preserved). Picking a Terminal CLI, the rotating placeholder, agent stickiness, and ⌘L all behave exactly as in the editor. The folder is a removable chip — clearing it drops to project scope; the content-root overview dispatches as bare project scope. Internally this adds a `folder` compose-scope to the unified handoff prompt assembler so folder dispatches keep `@`-mention support (the directive `composeFolderPrompt` path carries none).
