---
"@inkeep/open-knowledge-app": patch
---

Ask AI composer: the captured-selection chip now shares one wrapping row with the file-context chips instead of stacking on its own line above them. The chips sit on the same row and only break to a second line when they overflow the available width. The selection chip now truncates a long file name (capped at 16rem) so its label no longer spills past the chip's border, and the expanded selection preview still drops to its own line beneath the chips.
