---
"@inkeep/open-knowledge-server": patch
"@inkeep/open-knowledge": patch
---

`ok seed --dry-run` now previews a pack in an uninitialized directory instead of erroring with "Run `ok init` first". The prerequisite gate is skipped for dry-runs (whose purpose is to preview a pack before adopting it); real seeding still requires an initialized project.
