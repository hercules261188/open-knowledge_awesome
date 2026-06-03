---
"@inkeep/open-knowledge": patch
---

fix(open-knowledge): source-view tables no longer render indented left of surrounding text

GFM table rows in the Markdown source view rendered roughly 2ch to the left of the
surrounding prose, headings, and lists. The source-polish view-plugin set the
`.cm-table-row` / `.cm-table-header` line classes but never set the `--list-hang`
variable that the base `.cm-line` rule consumes, so the base `!important`
`padding-inline-start` overrode the standalone table `padding` while the table's
negative `text-indent` still applied, pulling table lines into the gutter. Tables
now participate in the same hanging-indent mechanism as lists and fenced code, so
they line up with body text. (PRD-6922)
