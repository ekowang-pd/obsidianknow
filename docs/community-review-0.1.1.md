# Community review fixes — 0.1.1

Review source: https://community.obsidian.md/account/plugins/deer-notes (0.1.0, commit 8b4b3d1).

## Blocking errors addressed
- Manifest: remove redundant Obsidian wording from the description.
- Preview Markdown: sanitize rendered Markdown with DOMPurify and insert a DOM fragment instead of assigning innerHTML. Raw HTML remains disabled. Added a formatting and unsafe-markup regression test.
- API compatibility: Workspace.revealLeaf is documented since 1.7.2; update the minimum version and versions map accordingly.
- Reader styles: use CSS classes for selection-menu visibility, sizing behavior, and overflow; retain calculated coordinates.

## Recommendations addressed
- Add build provenance attestations for all three release assets.
- Include the English usage guide directly in the root README.
- Document why vault enumeration is needed and distinguish hidden folders from access restrictions.
- Remove several untyped callbacks, validate stored preview records, use window timers, and remove a redundant view assertion.
- Replace the :has modal scrim selector with an explicit lifecycle class.

## Remaining nonblocking recommendations
- Browser-only preview uses localStorage and native confirmation; it has no Obsidian App storage API and is excluded from the plugin bundle.
- Shared DOM helpers use ownerDocument to support preview and popout contexts; native createEl migration is a future compatibility change.
- Declarative settings search, TFile narrowing, control-character filename sanitization, and existing accessibility CSS recommendations remain separate follow-up items. Mobile compatibility remains unverified.

Validation: 140 tests passed, plugin/preview type checks and builds passed, release contract passed. Community re-review is required to confirm the external result.
