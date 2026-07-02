---
"@inkeep/open-knowledge": patch
---

You can now work on several branches of a project at once, each in its own window. The project switcher in the sidebar footer groups your recent projects by repository: a project with open worktrees expands inline to show them (the current window's project is expanded by default), and typing in the search box matches projects, open worktrees, and the current project's branches. Opening a branch that has no worktree yet creates one on demand. "New worktree" lets you start a fresh branch or check out an existing one, and your worktrees also show up in the Cmd-K command palette. Worktrees are stored inside the project under `.ok/worktrees/` and kept out of git status automatically, so each window stays fully isolated (its own editor and server) without touching your working copy.
