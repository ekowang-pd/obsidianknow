# Task 4 Report: Vault 笔记服务与增量索引

## Implementation

- Added `NoteService` with a small typed Vault adapter boundary. Construction is read/write inert; first quick-note or attachment save creates only the required relative Vault folders.
- `saveQuickNote` reuses `noteTitle`, `uniqueNotePath`, and `createNoteMarkdown`; current Vault paths provide case-insensitive collision handling.
- `saveExcerptNote` finds deer-notes by parsed frontmatter `source` plus local `created` date, re-reads the selected `TFile` immediately before append, revalidates it, and propagates Vault write failures.
- `saveAttachment` permits PNG, JPEG, GIF, and WebP up to 20 MiB, writes via `createBinary`, and returns the configured relative attachment link.
- Added `VaultIndex` with a typed Vault event-source boundary. It produces frozen snapshots, reads Markdown content only below `notesFolder` to recognize deer-notes, incrementally handles create/modify/delete/rename, and unregisters all event references on disposal.
- Added in-memory-adapter behavioral tests without test-only production branches.

## RED evidence

Command:

```text
npm test -- tests/note-service.test.ts tests/vault-index.test.ts --pool=threads --poolOptions.threads.singleThread=true
```

Observed expected failure before either service module existed:

```text
FAIL  tests/note-service.test.ts
Error: Cannot find module '../src/services/note-service'

FAIL  tests/vault-index.test.ts
Error: Cannot find module '../src/services/vault-index'

Test Files  2 failed (2)
Tests  no tests
```

The test contracts were written first for lazy directory creation, file/dir conflicts, current-path collision handling, same-source same-day append/revalidation, attachment validation, immutable initialization, incremental events, listener disposal, and repeated lifecycle calls.

## GREEN verification

Focused command:

```text
npm test -- tests/note-service.test.ts tests/vault-index.test.ts --pool=threads --poolOptions.threads.singleThread=true
```

Output:

```text
✓ tests/note-service.test.ts (7 tests)
✓ tests/vault-index.test.ts (3 tests)
Test Files  2 passed (2)
Tests  10 passed (10)
```

Typecheck command:

```text
npm run typecheck
```

Output:

```text
> deer-notes@0.1.0 typecheck
> tsc --noEmit
```

The command exited with status 0 and no TypeScript diagnostics.

Complete-suite command:

```text
npm test -- --pool=threads --poolOptions.threads.singleThread=true
```

Output:

```text
Test Files  7 passed (7)
Tests  34 passed (34)
```

`git diff --check` exited with status 0 and emitted no whitespace errors.

## Typecheck correction

The first post-implementation typecheck correctly identified that dynamic `TAbstractFile` properties are `unknown` under strict TypeScript, and that the intentionally partial in-memory `TFolder` stubs needed explicit `unknown` casts. The single corrective change was a `typeof entry.extension === "string"` check in the Markdown guards plus explicit test-stub casts. The rerun above is green.

## Changed files

- `src/services/note-service.ts`
- `src/services/vault-index.ts`
- `tests/note-service.test.ts`
- `tests/vault-index.test.ts`
- `.superpowers/sdd/2026-09-10-deer-notes-plugin/task-4-report.md`

## Self-review

- No Node filesystem, absolute path, File System Access, delete, move, migration, or rename API is used by either service.
- Settings folder values are revalidated as relative Vault paths at the service boundary.
- Folder creation occurs only from save methods; index construction and initialization are write-free.
- A stale or repurposed excerpt target throws before `modify`, preserving the draft for the caller.
- Index snapshots freeze their object and all three arrays; subscriber callbacks receive exactly one snapshot per handled change.
- The changed production scope is limited to the two requested service modules and their tests.

## Commit

`feat: add vault note persistence and index`

## Concerns

- `VaultSnapshot` now deliberately exposes descriptors rather than `TFile`/`TFolder` handles. Task 5 should use the documented descriptor fields for navigation and notes, and retain any required Vault access through its own adapter/service boundary.

## Review fix round 1

### Root cause

- The append guard only re-parsed text and could still modify a `TFile` that had moved outside the configured notes folder.
- The original index exposed live `TFile`/`TFolder` references, mutated shared maps before asynchronous reads completed, and did not preserve mapped descendants on folder rename.
- A plain-object MIME map accepted inherited keys such as `constructor`.

### RED

Command:

```text
npm test -- tests/note-service.test.ts tests/vault-index.test.ts --pool=threads --poolOptions.threads.singleThread=true
```

Observed expected failures before the correction:

```text
× NoteService > does not append when the live matched file moved outside the notes folder during its final read
→ promise resolved instead of rejecting

× NoteService > writes only supported attachments below the configured directory and returns a relative link
→ promise resolved for MIME type "constructor"

× VaultIndex > remaps folder-rename descendants and re-evaluates deer-note membership
→ expected [ '小鹿笔记/原文.md' ], received []

× VaultIndex > removes the old entry when a Markdown file is renamed to a non-Markdown path
→ expected [], received the renamed .txt entry

× VaultIndex > serializes delayed classifications so a later delete cannot be undone by an older modify
→ deleted deer-note was restored

× VaultIndex > does not register, publish, or retain event listeners when disposed during initialization
→ initialization published after disposal

× VaultIndex > does not publish or mutate a snapshot when disposed during a delayed modify
→ snapshot changed after disposal

× VaultIndex > publishes deeply frozen value descriptors whose old paths do not mutate after rename
→ Object.isFrozen(descriptor) was false

Test Files  2 failed (2)
Tests  8 failed | 9 passed (17)
```

### Fix

- Before append, `NoteService` now confirms the live Vault entry is the exact matched file, remains Markdown, and remains beneath `notesFolder`.
- Attachment MIME lookup now uses `Map.get`.
- `VaultIndex` serializes source events through one queue and checks a lifecycle generation after every async boundary. Initialization assembles local maps before committing them, and disposal invalidates all pending continuations and unregisters registered event references.
- Folder rename remaps each private descendant handle by its current path and re-parses it when it enters or remains in `notesFolder`. File rename removes the old key before considering whether the new path is Markdown.
- Published snapshots now use only frozen primitive descriptors; raw Obsidian handles remain private.

Exact public descriptor types:

```ts
interface VaultFolderDescriptor { path: string; name: string }
interface VaultFileDescriptor { path: string; name: string; basename: string; extension: string }
interface DeerNoteDescriptor extends VaultFileDescriptor {
  title: string; created: string; updated: string; source: string; tags: readonly string[]
}
interface VaultSnapshot {
  rootFolders: readonly VaultFolderDescriptor[];
  markdownFiles: readonly VaultFileDescriptor[];
  deerNotes: readonly DeerNoteDescriptor[];
}
```

All descriptor objects and arrays, including `DeerNoteDescriptor.tags`, are frozen.

### GREEN

Focused command:

```text
npm test -- tests/note-service.test.ts tests/vault-index.test.ts --pool=threads --poolOptions.threads.singleThread=true
```

Output:

```text
✓ tests/note-service.test.ts (8 tests)
✓ tests/vault-index.test.ts (9 tests)
Test Files  2 passed (2)
Tests  17 passed (17)
```

Typecheck command:

```text
npm run typecheck
```

The command exited with status 0 and no TypeScript diagnostics.

Complete-suite command:

```text
npm test -- --pool=threads --poolOptions.threads.singleThread=true
```

Output:

```text
Test Files  7 passed (7)
Tests  41 passed (41)
```
