# Task 3 Report: 笔记领域格式、命名和活动计算

## Implementation

- Added pure TypeScript `notes` domain functions for stable title derivation, Windows-safe unique Markdown paths, narrow deer-note frontmatter creation/parsing, and same-source append formatting.
- Added pure TypeScript 91-day local-calendar contribution aggregation.
- Added behavioral tests for the domain contracts; no Obsidian APIs, Node filesystem APIs, settings interfaces, or navigation interfaces were changed.

## RED evidence

### Initial domain contracts

Command:

```text
npm test -- tests/notes.test.ts tests/contributions.test.ts
```

Observed expected failure before either domain module existed:

```text
FAIL  tests/contributions.test.ts
Error: Cannot find module '../src/domain/contributions'

FAIL  tests/notes.test.ts
Error: Cannot find module '../src/domain/notes'

Test Files  2 failed (2)
Tests  no tests
```

The tests specified title cleanup, reserved names, case-insensitive paths, exact Markdown frontmatter and body structure, metadata-safe append behavior, Unicode tags, and local-calendar contribution behavior before the modules were created.

### Append format correction

After the initial implementation, the append test failed because an extra blank line preceded the title after frontmatter parsing:

```text
FAIL  tests/notes.test.ts
deer note Markdown > appends a timestamped source excerpt while changing only updated and tags metadata
AssertionError: expected null to match object
```

The minimal correction removed only that extra separator.

### Append preservation correction

The added preservation assertion then failed against the first append implementation:

```text
FAIL  tests/notes.test.ts
expected content to contain "个人判断 #思考  \n\n## 09:00:00"
```

It exposed trailing-whitespace removal and repeated source links during append. The implementation now changes only the `updated` and `tags` frontmatter values, preserves existing body text, and appends only the timestamp/excerpt/body section.

### Case-insensitive path mutation check

The new ASCII case test was mutation-checked by temporarily removing lower-case normalization:

```text
FAIL  tests/notes.test.ts
expected 'deer/Idea.md' to be 'deer/Idea (2).md'
```

Restoring normalization returned the suite to green.

## GREEN verification

Command:

```text
npm test -- tests/notes.test.ts tests/contributions.test.ts
```

Output:

```text
✓ tests/contributions.test.ts (3 tests)
✓ tests/notes.test.ts (10 tests)
Test Files  2 passed (2)
Tests  13 passed (13)
```

Command:

```text
npm run typecheck
```

Output:

```text
> deer-notes@0.1.0 typecheck
> tsc --noEmit
```

The command exited with status 0 and no TypeScript diagnostics.

Additional regression verification:

```text
npm test
```

```text
Test Files  5 passed (5)
Tests  22 passed (22)
```

`git diff --check` completed without whitespace errors.

## Changed files

- `src/domain/notes.ts` — note title/path, Markdown creation/append, narrow frontmatter parser, and tag extraction.
- `src/domain/contributions.ts` — fixed 91-day local-calendar activity summary.
- `tests/notes.test.ts` — title, path, Markdown, parser, append, and tag behavior tests.
- `tests/contributions.test.ts` — empty, same-day, month-boundary, and ending-today streak tests.

## Self-review

- `noteTitle` uses the first non-empty paragraph, retains Markdown labels, removes formatting and Windows-illegal characters, collapses whitespace, truncates by Unicode code point to 60 characters, and prefixes Windows reserved filenames.
- `uniqueNotePath` uses normalized `/` separators and case-insensitive collision lookup without filesystem access.
- Dates and times use local Date getters; contribution dates are not derived by UTC string slicing. All 91 days, including zero-count days, are retained.
- Parser acceptance requires `type: deer-note`, JSON-quoted required string fields, JSON string tags, and a title heading. Missing or malformed frontmatter returns `null`; no YAML package was added.
- Appending preserves title, created date, source and existing body content; only `updated` and `tags` values change before the new section is added.

## Commit

`feat: add note format and activity model`

## Concerns

- Local-calendar calculations intentionally follow the JavaScript runtime's local timezone. This matches the product requirement and the configured desktop target; callers should supply ordinary local `Date` values rather than pre-sliced UTC dates.

## Review fix round 1

### Root cause

- `appendNoteMarkdown` merged `parseDeerNote(existing).tags` directly into `distinctTags`. The parser accepts a JSON string-array by design, so historical numeric-only values bypassed the extractor's letter-containing rule.
- The collision and tag deduplication keys used `toLocaleLowerCase()`, whose treatment of ASCII `I` can vary with the host locale.

### RED

Command:

```text
npm test -- tests/notes.test.ts
```

Observed failures before the correction:

```text
× deer note titles and paths > uses deterministic ASCII case folding instead of the runtime locale
→ expected 'deer/Idea.md' to be 'deer/Idea (2).md'

× deer note Markdown > appends a timestamped source excerpt while changing only updated and tags metadata
→ expected [ '思考', '2026', '复盘', '新标签' ] to deeply equal [ '思考', '复盘', '新标签' ]

Test Files  1 failed (1)
Tests  2 failed | 9 passed (11)
```

The locale test uses a scoped spy that simulates Turkish-style lowercasing and restores it in `finally`; it does not change the process locale.

### GREEN

`normalizedTag` now applies the same trailing-delimiter and Unicode-letter rule to metadata tags before deduplication. All collision and deduplication keys use deterministic `toLowerCase()`.

Command:

```text
npm test -- tests/notes.test.ts tests/contributions.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Successful output:

```text
✓ tests/notes.test.ts (11 tests)
✓ tests/contributions.test.ts (3 tests)
Test Files  2 passed (2)
Tests  14 passed (14)
```

Command:

```text
npm run typecheck
```

Successful output:

```text
> deer-notes@0.1.0 typecheck
> tsc --noEmit
```

The default-worker form of the focused Vitest command intermittently remained at `RUN` without returning test output in this worktree. The single-worker invocation above completed successfully and is the same project-local workaround recorded for earlier task tests.

## Review fix round 2

### RED

Added a scoped locale-sensitive `String.prototype.toLocaleLowerCase` stub and supplied `#IDEA #idea #Idea`. A controlled mutation of tag deduplication back to `toLocaleLowerCase()` produced the expected regression failure:

```text
× deer note Markdown > deduplicates differently cased ASCII tags independently of the runtime locale
→ expected [ 'IDEA', 'idea' ] to deeply equal [ 'IDEA' ]

Test Files  1 failed (1)
Tests  1 failed | 11 passed (12)
```

The stub is restored in `finally`; it does not change the process locale.

### GREEN

The production `toLowerCase()` implementation was restored unchanged.

Command:

```text
npm test -- tests/notes.test.ts tests/contributions.test.ts --pool=threads --poolOptions.threads.singleThread=true
```

Successful output:

```text
✓ tests/notes.test.ts (12 tests)
✓ tests/contributions.test.ts (3 tests)
Test Files  2 passed (2)
Tests  15 passed (15)
```

Command:

```text
npm run typecheck
```

Successful output:

```text
> deer-notes@0.1.0 typecheck
> tsc --noEmit
```
