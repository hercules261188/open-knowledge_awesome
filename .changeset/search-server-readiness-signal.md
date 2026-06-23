---
"@inkeep/open-knowledge": patch
---

Make `/api/search` report when its index is still warming, so cold-start searches retry instead of returning false-empty results.

Right after the server boots, the workspace search index is still being built from the on-disk file walk. A search arriving in that window previously either blocked or came back empty as if nothing matched. The search endpoint now answers immediately with a `ready: false` signal while the index is warming, and `ready: true` once it is built.

The `search` MCP tool surfaces this: instead of reporting "no matches" during warm-up, it tells the agent the index is still building and to wait a couple of seconds before retrying (or fall back to `exec` grep). The command palette shows its "Preparing search" status and polls until the index is ready, so results appear without retyping. This complements the earlier client-side cold-load fix by closing the same race at the server for every consumer.
