# 0.2.0-preview.1 — Reading to understanding

This GitHub prerelease includes the completed local changes for desktop testing. It does not replace stable 0.1.2 or claim community review approval.

## What's changed
- All notes now includes existing visible vault Markdown, making body search useful for established libraries. Configured hidden folders and dot paths are excluded from displayed results.
- Cards remain distinct when native theme backgrounds match; sidebar icons and labels align with the brand. Recent activity is always visible and counts visible Markdown updates.
- Excerpt notes offer optional understanding, connection, and application prompts. Reusing a prompt returns to that section; Chinese and English headings are recognized without translating the draft.
- Hide the excerpt and background article while explaining in your own words, then reveal them to check. Ctrl/Cmd+Enter saves, with IME and pending-save guards.
- The product guide now includes four real browser screenshots with demonstration content, installation steps, and explicit stable/preview boundaries.

## Install
Download main.js, manifest.json, and styles.css from this release together and place them in .obsidian/plugins/deer-notes/ inside a test vault, then reload the plugin. The manifest uses numeric version 0.2.0; the prerelease suffix belongs to the Git tag.

## Checks and remaining verification
146 tests passed before packaging. Plugin and preview type checks/builds and the release contract are required. CI rebuilds release assets from the tag and generates provenance attestations.

Real Obsidian theme behavior, mobile interaction, and large-vault responsiveness require further verification. Browser screenshots are not native-app certification. Community review must be checked separately before promoting a stable release.

Official references checked on 2026-09-12:
- https://docs.obsidian.md/plugins/releasing/submit-plugin
- https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- https://docs.obsidian.md/community-directory/manage-entry

The local preflight checks common manifest and packaging errors; it does not replace the community scanner or guarantee approval.
