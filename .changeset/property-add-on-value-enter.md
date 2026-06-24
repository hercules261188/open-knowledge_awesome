---
"@inkeep/open-knowledge": patch
---

Add a property by pressing Enter in its value field.

When adding a frontmatter property, typing a name, pressing Tab, typing a value, and pressing Enter now commits the new property — the whole interaction is keyboard-driven. Previously Enter in the value field only settled the value and blurred the input, so the property was not added until you clicked "Add" with the mouse. This works for text, number, and date values, in both the document property panel and a folder's properties; editing an existing property's value keeps its prior Enter-to-settle behavior.
