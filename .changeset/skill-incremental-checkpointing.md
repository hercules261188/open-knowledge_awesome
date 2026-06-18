---
"@inkeep/open-knowledge": patch
---

Open Knowledge skill guidance now mandates incremental checkpointing: agents write completed work into the knowledge base as they go — per section, per source, per doc — instead of holding finished findings in context for one final write. A new "Persist incrementally — the knowledge base IS your checkpoint" rule lands in the project skill's Writing section, and the `research` and `consolidate` workflow guides now instruct agents to create the article skeleton early and fill it section-by-section as each source is analyzed. This prevents the worst-case "got rate limited and discarded its findings" outcome, where completed (paid-for) research work is lost to a mid-session rate limit, crash, or context compaction.
