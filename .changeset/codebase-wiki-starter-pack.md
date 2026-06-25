---
"@inkeep/open-knowledge": minor
---

Add the `codebase-wiki` starter pack — an agent-authored, navigable wiki of your codebase. `ok seed --pack codebase-wiki` scaffolds a `wiki/` knowledge base (architecture, modules, flows, concepts, and guides — each with a page template) plus an `OVERVIEW` hub and a generation log. The new `workflow({ kind: "wiki" })` guide drives an agent to generate — and later incrementally refresh — the wiki from source, with mermaid diagrams, cross-linked pages, and source references, tuned by two natural-language knobs (`audience`: internal/public, `depth`: tour/standard/exhaustive). Version-controlled and private by default; the wiki doubles as durable grounding context for future agent sessions.
