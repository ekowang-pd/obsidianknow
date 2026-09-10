# Interface language — 0.1.2

Scope: add a persisted interface-language setting (Simplified Chinese / English), translate dashboard navigation, composer controls, reader/excerpt controls, overview charts and plugin settings. User-authored note text, tags and real folder names remain unchanged.

Implementation review: self-reviewed by the implementing Codex agent. Translation is per view/plugin setting, not a global mutable locale. Older settings default to Chinese. Language changes refresh existing dashboard controls without rebuilding the draft editor. Failed settings persistence does not replace the active settings. Browser preview stores its language separately from demo note data.

Validation: 142 tests passed; plugin and preview type checks/builds and release contract passed. Regression coverage includes language persistence/failure, switching both ways, preservation of draft text and Chinese folder names, and overview labels. Browser verification confirmed English navigation, composer, overview and reader controls, plus language retained after reload.

Limits: native Obsidian was not automated in this run; mobile remains unverified. Existing note content and operating-system/service error details can remain in their original language. Community review and client directory availability are separate from a successful GitHub release.
