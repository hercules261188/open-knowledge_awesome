---
"@inkeep/open-knowledge": patch
---

Fix the empty-state "copy prompt" rows not working when OK runs inside an embedded host iframe (e.g. Claude). The copy buttons called the async Clipboard API directly, which the host frame's Permissions-Policy refuses inside an iframe — the rejection was swallowed silently, so nothing copied and the row never showed "Copied". The copy now routes through the shared clipboard adapter, whose `execCommand` fallback succeeds under the click's user activation where the policy-gated async write is blocked.
