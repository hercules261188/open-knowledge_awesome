---
"@inkeep/open-knowledge": patch
---

Markdown documents containing an astral (non-BMP) codepoint such as an emoji before a guard-unmatched `{` no longer get a stray `{` minted into otherwise-untouched text when the document is parsed and re-serialized. Previously, each astral codepoint before the brace shifted an internal protection sentinel one position too far, so on restore a real character was overwritten with `{` and the genuine `{` was left unprotected. This affected every editor render, every `position: 'replace'` agent write, and every disk save of such a document.
