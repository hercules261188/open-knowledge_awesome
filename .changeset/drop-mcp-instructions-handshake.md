---
"@inkeep/open-knowledge": patch
---

The Open Knowledge MCP server no longer emits a handshake `instructions` block. That block was injected into every project the (globally-registered) server connected to — including non-Open-Knowledge projects — which steered agents toward OK tools they could not use there. Agent guidance for OK projects is delivered by the installed `open-knowledge` project skill, which is the single source of that contract.
