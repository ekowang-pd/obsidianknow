# Deer Notes 0.3.0

## New
- Visual Markdown composer powered by Tiptap, with formatting, undo/redo, local image upload, paste/drop and tag selection.
- Image covers for Markdown note cards, clearer title-first hierarchy and theme-aware card contrast.

## Fixed
- Clear a previous search after successful note creation so the new note is visible. Failed saves keep both draft and search.
- Continue searching when an individual file cannot be read; still report an error when all required reads fail.
- Start a fresh undo history after saving to prevent previous notes from reappearing in the next draft.

## Validation
- Browser walkthrough: text input, tag selection, local image upload, save and search-to-create flow.
- Automated regression coverage includes Markdown image paths, image failure fallback, paste/drop handling, IME-safe shortcuts and the three fixes above.
- Native Obsidian runtime and mobile rendering require user acceptance after reload. Existing plugin settings and vault notes are preserved during local update.
- Existing logo is retained; alternative concepts are not part of this release.
