---
"@inkeep/open-knowledge": patch
---

MCP project routing now sticks to the worktree you name. Pass `cwd` once on an OK tool call and later `cwd`-less calls in the same session reuse it, so an agent working in a git worktree no longer has its reads, writes, and preview silently target the main checkout. When a `cwd`-less call resolves into a repo that has multiple git worktrees via the client's single advertised root, the server emits a one-time, non-blocking nudge to pass `cwd` — it does not refuse, so working in the main checkout while feature worktrees exist is unaffected.
