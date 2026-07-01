---
"@inkeep/open-knowledge": patch
---

You can now work on several branches of a project at once, each in its own window. The project switcher in the sidebar footer (and the File menu) has a new Worktrees section: pick a branch to open its worktree in a new window — if it doesn't have one yet, OpenKnowledge creates it on demand — or choose "New worktree…" to start a fresh branch. Worktrees are stored inside the project under `.ok/worktrees/` and kept out of git status automatically, so each window stays fully isolated (its own editor and server) without touching your working copy.
