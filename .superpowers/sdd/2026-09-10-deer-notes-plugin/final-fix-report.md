# Final fix report — Deer Notes

Date: 2026-09-10. Baseline commit: `0170808`.

Authoritative inputs read in full before implementation:

- `docs/superpowers/specs/2026-09-10-deer-notes-plugin-design.md`
- `.superpowers/sdd/2026-09-10-deer-notes-plugin/final-findings.md`

The working tree was clean at the start. The work followed systematic debugging, test-driven development, and verification-before-completion. No subagents were used in this fix wave.

## Outcome

All Critical and Important findings, and all five listed Minor findings, are addressed. The final single-thread suite passes **120 tests in 13 files** in both the normal `Asia/Shanghai` environment and `TZ=UTC`. Type checking, production build, release checks, and whitespace checks pass.

The plugin still has no npm production dependencies. All Vault writes use Obsidian APIs. This wave did not publish a release, create a tag, push a branch, install into a live Vault, or alter user notes or attachments.

## Changes and focused TDD evidence

Every production behavior change was preceded by an observed failing regression. Failures below were assertion failures exposing the described behavior, not missing imports or setup failures.

### C1 — Atomic excerpt append

`NoteService` now uses `Vault.process(file, transform)`. The transform validates the live file identity, Markdown extension, configured folder, ownership metadata, source, and local creation day before appending to the current contents supplied by the Vault.

- RED: `npm run test:single-thread -- tests/note-service.test.ts` produced **3 failures / 9 tests**. The external edit disappeared; a replaced ownership header and a file moved outside the notes folder both incorrectly resolved instead of rejecting.
- GREEN: the same command passed **9 / 9** after replacing cached read + modify with an atomic callback.
- The regression injects an external edit after matching and immediately before the write boundary. It asserts that both the external text and new excerpt remain in the same note.
- Existing error/draft preservation behavior remains covered by dashboard and reader tests.

### I1 — Ordinary YAML and metadata preservation

Pure domain functions now receive an explicit YAML parser/codec; service boundaries supply Obsidian `parseYaml` and `stringifyYaml`. Append changes `updated` and `tags` in the parsed property object while preserving unrelated property values and the exact pre-existing Markdown body. Supported forms include quoted/unquoted scalars, YAML dates, indented and unindented block lists, flow lists, scalar tags, empty optional fields, nested metadata, and block scalar values.

- RED: `npm run test:single-thread -- tests/notes.test.ts tests/note-service.test.ts` produced **5 failures / 26 tests**: three Properties-style fixtures returned null, append rejected a valid note with unrelated metadata, and the service created a duplicate after a Properties edit.
- RED: `npm run test:single-thread -- tests/notes.test.ts -t 'timestamp dates'` produced **1 failure**, proving timestamp-valued dates and empty optional Properties fields were rejected.
- GREEN: `npm run test:single-thread -- tests/notes.test.ts tests/note-service.test.ts tests/vault-index.test.ts` passed **37 / 37** after the initial YAML fix.
- Self-review RED: the later scalar-tag regression returned undefined for `tags: 思考`; the implementation now accepts it and appends without losing it.
- Final relevant tests: notes **18**, note service **10**, index **19**, all passing.
- `yaml` was added only to `devDependencies` (lockfile resolves **2.9.0**) so the tests exercise a real YAML implementation. There is no YAML package in the production bundle. Parser API reference: <https://eemeli.org/yaml/>. Obsidian API compatibility was checked against the installed `obsidian.d.ts`.

### I2 / I5 — Initialization events, on-demand startup, and linear enumeration

The index subscribes before its initial asynchronous scan. A scan barrier gates the event queue, queued events reconcile the scanned state before the first published snapshot, and simultaneous initialization requests share one scan. Current-file checks use `getAbstractFileByPath(path) === file` rather than repeatedly enumerating all Markdown files.

Plugin load only registers capabilities. Index initialization starts when the dashboard is first opened, including a restored dashboard's `onOpen`. Changing the notes-folder setting with no open dashboard does not scan. Open views continue to rebind on settings changes.

- RED: `npm run test:single-thread -- tests/vault-index.test.ts` produced **6 failures / 15 tests**. Initialization lost create, modify, and rename events; two simultaneous initializations enumerated 20 files **42 times**; timestamps were absent; early subscriptions were not yet released by the revised disposal contract.
- GREEN: the initial index fix passed **16 / 16**, including a preserved-behavior retry regression for an initial read error.
- RED: `npm run test:single-thread -- tests/main.test.ts` produced **2 failures / 9 tests**: plugin load already scanned, and a restored view missed a file created after load.
- GREEN: main/dashboard/reader integration passed **21 / 21** after on-demand startup was implemented.
- Self-review RED: `npm run test:single-thread -- tests/vault-index.test.ts -t 'whole folder'` produced **1 failure** because a whole-folder rename during the first read lost an unindexed descendant. Folder rename reconciliation now also walks the renamed folder's live descendants, without a whole-Vault enumeration.
- Self-review RED: a failed read caused by an already deleted file rejected initialization. The index now treats a read failure as a stale classification only after confirming the captured file identity/path is no longer current. Genuine read failures still propagate and can be retried.
- Final index tests pass **19 / 19**. The concurrency/performance regression confirms exactly **one enumeration, 20 classifications, and four subscriptions** for two simultaneous initialization calls.

### I3 — Portable local-day fixtures

Tests now construct local wall-clock dates with numeric `Date` constructors. No production date calculation was changed or pinned to a timezone.

- RED: `$env:TZ = 'UTC'; npm run test:single-thread -- tests/notes.test.ts tests/contributions.test.ts` produced **3 failures / 20 tests**. A timestamp rendered as `04:14:39` instead of `12:14:39`, an append timestamp rendered as `00:00:01` instead of `08:00:01`, and two offset fixtures landed on the preceding UTC day.
- GREEN: the same UTC command passed **20 / 20** after fixing only fixtures.
- The final release test command passes **120 / 120** under UTC as well as the normal environment.

### I4 — Recent modification activity

Snapshot descriptors now contain immutable `ctime` and `mtime` values copied from `TFile.stat`. The dashboard uses `mtime`, displays the heading `最近修改活动`, and explains that cells reflect each note's latest modification date. Both note and source-document timestamps refresh on modify events; source-document bodies are not read for classification.

- RED: the index timestamp regression expected `{ ctime: 1000, mtime: 2000 }` but received neither field.
- RED: the dashboard regression expected a cell level of `1` for a recently modified old note but received `0` because the UI used frontmatter `created`.
- Self-review RED: a modified source-document descriptor retained `mtime: 2000` instead of `9000` because outside-folder modifications did not publish a new snapshot.
- GREEN: index and dashboard regressions now show the updated modification day while preserving old snapshot timestamps; the heatmap still has **91 cells**.

### I6 / M1 — Preview cleanup and navigation focus

Quick preview has a `finally` path equivalent to the reader's stale-render finalization. If the preview is hidden, replaced, or the view closes, late Markdown renderer registrations are unloaded. Sidebar rebuilds restore the same still-existing focused navigation item and use the selected item only as a fallback.

- RED: `npm run test:single-thread -- tests/dashboard-view.test.ts tests/reader.test.ts` produced **4 failures / 33 tests**: modification-day activity, two late-preview listener leaks (close and hide), and focus returning to the selected item instead of the focused unselected folder.
- The preview regressions use a real event target: the renderer registers a listener after the first cleanup; the test checks that the listener cannot receive a later event.
- GREEN: the same command passed **33 / 33**. Existing input-focus preservation and deleted-folder fallback remain covered.

### M2 — Cancel animation frames before close/dispose

Added explicit close-before-frame and dispose-before-frame regressions. The implementation was already correct, so no production reader change was retained.

- Initial regression baseline: both cases passed as part of **18 reader tests**.
- Mutation RED: temporarily omitting the animation-frame cancellation registration and running `npm run test:single-thread -- tests/reader.test.ts -t 'cancels pending menu'` produced **2 failures** (`pending.size` remained `1` instead of `0`).
- The exact original cancellation was restored with a patch; the final full suites pass both cases. `src/views/reader.ts` has no net diff.

### M3 / M4 — Folder suggestions and release identity

Settings now attach native datalists to both folder inputs. Suggestions contain existing non-hidden Vault folders; attachment suggestions are relative descendants of the current notes folder and refresh on focus. Choosing a suggestion continues through the existing validation/save path. No runtime dependency was added for suggestions.

The manifest uses Basic-Latin `Deer Notes` and author `EDY`. Chinese UI branding remains `小鹿笔记`; README installation instructions match the manifest name.

- RED: `npm run test:single-thread -- tests/settings.test.ts tests/manifest.test.ts` produced **3 failures / 8 tests**: both suggestion lists were empty and the manifest name failed the Basic-Latin release contract.
- GREEN: the same command passed **8 / 8** after implementation/metadata edits.

### M5 — Development advisories

`npm audit --json` reports **3 moderate affected development dependency entries**, covering two upstream advisories:

| Dependency | Advisory | Suggested audit fix |
| --- | --- | --- |
| `@vitest/mocker` | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Vitest major upgrade |
| `vitest` | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Vitest major upgrade |
| `esbuild` | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | Breaking version upgrade |

The existing versions were retained as requested, and the advisories are documented in README. No forced or unverified upgrade was performed. The package-lock diff adds only the test YAML dependency.

## Final verification

| Command/check | Result |
| --- | --- |
| `npm run test:single-thread` | Exit 0; **13 files, 120 tests passed**, normal timezone `Asia/Shanghai`; run started 17:27:06 local |
| `$env:TZ = 'UTC'; npm run test:single-thread` | Exit 0; **13 files, 120 tests passed**; run started 09:27:06 UTC |
| `npm run typecheck` | Exit 0 on the final serial run; no diagnostics |
| `npm run build` | Exit 0; production `main.js` rebuilt |
| `npm run release:check` | Exit 0; `deer-notes 0.1.0`, `main.js`, `manifest.json`, `styles.css` verified |
| `git diff --check` | Exit 0; no whitespace errors |
| Production bundle VM load with a require allowlist | Plugin default export loaded; the only external module requested was `obsidian` |
| `npm ls --omit=dev --depth=0` | Exit 0; empty production dependency tree |
| `npm audit --json` | Exit 1 because of the three documented moderate development entries; zero high/critical entries |

An initial typecheck launched concurrently with both full suites ended with `Fatal process out of memory: Zone` on this host. It was rerun alone after the test processes exited and passed without changing code or compiler options. Git also prints the existing Windows LF-to-CRLF conversion notices; `diff --check` reports no actual whitespace defects.

## Self-review and limits

- Reviewed the complete production diff, adapter changes, fixture changes, dependency lockfile, manifest, README, and styles against the findings and design.
- Domain code remains free of Obsidian and Node imports. The two Markdown parsing/appending helpers now take an explicit codec argument; their only production consumers were updated. `NoteVaultAdapter` now requires `process`, and `VaultIndexAdapter` requires a direct path lookup.
- File identity, configured-folder confinement, source, date, and ownership checks happen inside the atomic write. A rejected transform does not replace the existing content.
- Initial and incremental snapshots stay immutable; lifecycle guards prevent disposed work from publishing. Initial event replay does not cause a second whole-Vault scan.
- No telemetry, network API, Electron API, Node filesystem API, or dynamic code execution was introduced into production. The VM check's Node usage is verification-only.
- The existing Markdown body, including trailing spaces and body lines named `updated` or `tags`, is preserved on append. Unrelated YAML property values are preserved; YAML serialization can normalize frontmatter formatting and does not promise to preserve YAML comments.
- Desktop Obsidian installation, real plugin processor behavior, third-party theme visual QA, and mobile behavior were not manually tested in this wave. Automated tests use controlled Vault/Obsidian boundaries and real DOM behavior where appropriate. These remain release validation steps, not claimed completed work.
- No Critical or Important code finding remains open in this report's scope. The known development advisories and the manual validation limits above remain explicit.

This report is committed alongside the fixes. The final commit ID is supplied in the handoff message.
