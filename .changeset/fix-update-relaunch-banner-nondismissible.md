---
"@inkeep/open-knowledge": patch
"@inkeep/open-knowledge-core": patch
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge-app": patch
"@inkeep/open-knowledge-desktop": patch
---

Remove the dismiss X from the "Relaunching to install the update…" banner. That card is a terminal in-progress state shown the instant Relaunch is clicked — there is nothing to dismiss, and the card already disappears when the app restarts, so a manual close would only hide live progress. The armed "Version X ready to install" card keeps its X (the user can still close it and relaunch later); only the post-click in-progress swap is now non-dismissible, via a new `dismissible` flag on the update-notice shape.
