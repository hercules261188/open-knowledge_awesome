---
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-app": patch
---

Tighten the docked-terminal launch prompt. Opening a file, folder, or project in the desktop terminal ("Open in terminal" / file-tree + empty-space context menus) now hands the agent a minimal directive: it states the agent is running in the Open Knowledge desktop app terminal, loads the OK runtime contract, reads the open file via the OK MCP server when one is focused, then stops — instead of the previous open-ended "Let's work on X" invitation. A bare launch that isn't on a focused file (a folder right-click, empty-space, or project) deliberately reduces to "state surface, load OK, then stop" — the prior folder-scoped "Let's work on the `folder`" directive is intentionally dropped in favor of that minimalism. Launches that carry explicit user intent (a typed "Open with AI" instruction, or the empty-state "Create with Claude CLI" brief) are unchanged — they keep threading that intent through. The web deep-link handoff is unaffected.
