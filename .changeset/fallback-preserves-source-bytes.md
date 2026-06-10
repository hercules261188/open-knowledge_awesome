---
"@inkeep/open-knowledge-core": patch
---

Parse-error fallback blocks now preserve the source bytes they replace. When a block degrades to a fallback and its position carries only line/column information (no character offsets), the editor now resolves those against the document and shows the block's real content. When the position is genuinely unresolvable (missing, out of bounds, or inverted), the fallback degrades to empty content instead of substituting the mdast node-type name for the block's content — fabricated text that could previously be persisted back over the user's document on interaction (users observed this on an earlier build as a block collapsing to a literal word such as `table` or `list`).
