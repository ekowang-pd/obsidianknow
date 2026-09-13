# Deer Notes 0.3.3

Adds “Revisit a note” / “随机重读” above the note list. Opens a random note from the current folder and search results, respecting hidden folders. Avoids the immediately previous choice when another result exists. Search and unsaved composer text are preserved; nothing is scheduled or written to the vault. The button waits for search completion and blocks duplicate opens.

Validation: 158 tests; TypeScript and production/preview builds; browser checks for opening, back navigation, search and folder scoping. Native Obsidian and mobile behavior remain to be verified. This is a navigation aid, not a spaced-repetition queue or evidence of improved learning.

Inspired by the random revisit practice in https://stephango.com/vault and the portable-file principle in https://stephango.com/file-over-app.
