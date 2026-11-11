# Plan 001: Git Axon v0.1 exists — review ahead commits by reading the final files with a green/red change overlay

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: this plan was written against an **empty
> repository** (branch `main`, zero commits, no files except `plans/`).
> Run `git ls-files | grep -v '^plans/' | wc -l` and `ls -A | grep -v -E '^(\.git|plans)$'`.
> Expected: `0` and no output. If the repo already contains source files,
> treat it as a STOP condition — someone started the work and this plan must
> be reconciled first.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (greenfield; the risk is VS Code API limits, called out below)
- **Depends on**: none
- **Category**: direction (new feature build)
- **Planned at**: empty repository (no commits yet), 2026-11-11

## Why this matters

GitHub, Sourcetree and VS Code's own SCM view show a review as *diffs*: only
the changed hunks, split away from the surrounding file. The owner of this
project finds that hard to review, because they cannot see the final result.
Git Axon is a VS Code extension that flips this: it opens the **real, final,
editable files** touched by the commits that are ahead of the base branch, and
paints the changes on top of them as a "ghost" overlay — new/changed lines
tinted green, removed lines marked in red with the old text available on
hover, and a one-click trigger to the native diff when needed. It also lets
the reviewer select any X commits and open every file those commits touched.

## Product behaviour (the specification)

This section is the contract. Everything below was decided by the advisor to
close gaps in the original request; do not re-decide it.

### Vocabulary (use these words in names, comments and UI text)

- **Base ref** — the branch the work is compared with (e.g. `origin/main`).
- **Baseline** — the commit SHA whose file contents are the "before" side.
- **Ahead commits** — commits in `baseline..HEAD`.
- **Review scope** — baseline + the list of files under review. Two kinds:
  `ahead` (the default) and `commits` (a manual selection of commits).
- **Review file** — one file in the review scope.
- **Overlay** — the editor decorations that show changes on the final file.

### Review scope: `ahead` (default, built on activation)

1. Base ref resolution, first match wins:
   1. setting `gitAxon.baseRef` if non-empty and it resolves to a commit;
   2. the upstream of the current branch (`@{upstream}`);
   3. `origin/HEAD`'s target;
   4. the first that exists of `origin/main`, `origin/master`, `main`, `master`;
   5. otherwise `HEAD`.
2. Baseline = `git merge-base <baseRef> HEAD`. If merge-base fails, baseline =
   the SHA of the base ref. If the repo has no commits at all, baseline = the
   git empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`.
3. Review files = everything that differs between the baseline and the
   **working tree** (so uncommitted edits count — the reviewer sees the true
   final result), plus untracked non-ignored files when
   `gitAxon.includeUntracked` is true.

### Review scope: `commits` (user selects X commits in the Commits view)

1. Baseline = first parent of the **oldest** selected commit (empty tree if it
   is a root commit).
2. Touched paths = union over each selected commit of the paths in
   `git diff --name-status -M -z <firstParent> <sha>`.
3. Review files = files that differ between baseline and working tree,
   filtered to those whose path (or pre-rename path) is in the touched paths.
4. Known, accepted limitation: for a non-contiguous selection the overlay also
   shows changes made to those files by the commits in between. Document it in
   the README; do not try to fix it.

### Overlay on a review file (opened as the normal working-tree file)

The "before" text is the file content at the baseline; the "after" text is
the **live editor buffer** (so the overlay stays correct while typing). The
line diff is computed in-process with the `diff` npm package.

| Change | What the reviewer sees |
|---|---|
| Lines added | whole-line green background + green mark in the overview ruler |
| Lines modified | whole-line green background; red ghost badge `−N` after the first line; hovering any of the lines shows the old text |
| Lines removed | red 2px line on top of the line that now follows the removal; red ghost badge `−N` after it; red mark in the overview ruler; hovering shows the removed text |

Hover content is a fenced `diff` code block of the old lines (max 40 lines,
then "… N more lines"), followed by an "Open diff" command link.

**API limit you must not fight**: VS Code extensions cannot insert multi-line
"view zones" into a normal editor. Removed lines can therefore *not* be
rendered inline as full red lines. The badge + hover + "Open diff" trigger is
the designed answer. Do not attempt webviews, the Comments API, or a custom
editor to work around this.

Not overlaid: deleted files (clicking one opens its baseline content
read-only), binary files, files over 20,000 lines or whose baseline text is
over 2,000,000 characters.

### UI surface

- Activity-bar container **Git Axon** with two tree views:
  - **Review Files** (`gitAxon.files`) — flat list. Label = file name,
    description = `<directory> · <status letter>`, file icon via
    `resourceUri`. Click opens the file (deleted file → baseline content).
    The view's `description` shows the scope label, e.g.
    `ahead of origin/main · 4 commits` or `3 selected commits`.
  - **Commits** (`gitAxon.commits`) — the last `gitAxon.historyLimit` commits
    from HEAD, multi-select enabled. Label = subject, description =
    `<short sha> · <author> · <relative date>`, icon `arrow-up` for ahead
    commits and `git-commit` otherwise.
- Status-bar item (left): `$(git-compare) Axon: <ahead>↑ · <n> files`; click
  focuses the Review Files view.
- Commands (all under the `Git Axon:` category):

| Command id | Title | Where |
|---|---|---|
| `gitAxon.openAllFiles` | Open All Review Files | Review Files title bar, palette |
| `gitAxon.reviewSelectedCommits` | Review Selected Commits (Open Their Files) | Commits item inline button + context menu, Commits title bar, palette |
| `gitAxon.reviewAhead` | Review Ahead Commits | Commits title bar, Review Files title bar, palette |
| `gitAxon.openDiff` | Open Diff Against Baseline | editor title bar (review files only), hover link, Review Files item inline button, palette |
| `gitAxon.toggleOverlay` | Toggle Change Overlay | editor title bar (review files only), palette |
| `gitAxon.chooseBase` | Choose Base Ref… | Review Files title bar overflow, palette |
| `gitAxon.refresh` | Refresh | both title bars, palette |
| `gitAxon.openFile` | (internal, hidden from palette) | tree item click |

- `gitAxon.openAllFiles` opens every non-deleted review file as a pinned
  (non-preview) tab. If the count exceeds `gitAxon.openAllConfirmThreshold`
  it first asks with a modal confirmation.
- `gitAxon.reviewSelectedCommits` switches the scope to `commits` for the
  selected commits and then runs the same open-all logic.
- Settings: `gitAxon.baseRef` (string, `""`), `gitAxon.includeUntracked`
  (boolean, `true`), `gitAxon.historyLimit` (number, `100`),
  `gitAxon.openAllConfirmThreshold` (number, `25`), `gitAxon.autoOpenFiles`
  (boolean, `false` — when true, run open-all once on activation).
- No default keybindings are contributed (avoids conflicts). The README tells
  the user how to bind `gitAxon.toggleOverlay` and `gitAxon.openDiff`.

### Explicitly not in v0.1

Multi-root / multiple repositories (use the first workspace folder that is
inside a git repo), git worktrees/submodules where `.git` is a file (manual
Refresh still works), per-commit precise highlighting via blame, a multi-file
diff editor, staging/committing of any kind, extension-host UI tests,
Marketplace publishing.

## Current state

- The repository at the working directory is empty: `.git/` only, branch
  `main`, no commits, no remote.
- There are no conventions to match. This plan *establishes* them:
  TypeScript strict, 2-space indent, single quotes, semicolons, named exports
  only, one responsibility per file, no `any` except at JSON boundaries.
- **Architecture rule (load-bearing for testing)**: files that contain logic
  must not import `vscode`. Only `extension.ts`, `overlay.ts`, `views.ts`,
  `baseContent.ts` may import `vscode`. Tests never import those four.

Toolchain verified on the owner's machine on 2026-11-11: Node 26.13, npm
11.20, git 2.54, VS Code 1.145.2. Latest npm versions at that time: `diff`
9.0.0 (ships its own TypeScript types; `diffLines(oldStr, newStr)` returns
`ChangeObject<string>[]` with `value`, `added`, `removed`, `count`),
`typescript` 7.0.2, `esbuild` 0.28.2, `vitest` 5.1.0. VS Code API facts
verified in `@types/vscode`: `TreeViewOptions.canSelectMany`,
`MarkdownString.isTrusted = { enabledCommands: [...] }`,
`DecorationInstanceRenderOptions.after`, `DecorationOptions.hoverMessage`,
`workspace.registerTextDocumentContentProvider`. There is **no** stable
`registerQuickDiffProvider`; do not use quick-diff.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0, `dist/extension.js` exists |
| Package (optional, last step) | `npm run package` | a `git-axon-0.1.0.vsix` file |

(These scripts do not exist yet; step 1 creates them.)

## Scope

**In scope** (create these; modify nothing else):

- `package.json`, `package-lock.json`, `tsconfig.json`, `esbuild.mjs`
- `.gitignore`, `.vscodeignore`, `.vscode/launch.json`, `.vscode/tasks.json`
- `README.md`, `media/axon.svg`
- `src/git.ts`, `src/gitParse.ts`, `src/lineChanges.ts`, `src/hoverText.ts`,
  `src/scope.ts`, `src/baseContent.ts`, `src/overlay.ts`, `src/views.ts`,
  `src/extension.ts`
- `test/gitParse.test.ts`, `test/lineChanges.test.ts`,
  `test/hoverText.test.ts`, `test/scope.test.ts`
- `plans/README.md` (status row only)

**Out of scope** (do NOT do):

- No `LICENSE` file and no `publisher` other than the placeholder below — the
  licence and Marketplace identity are the owner's decisions.
- No git *write* operations anywhere in the extension (no add, commit,
  checkout, stash, fetch). The extension is strictly read-only on the repo.
- No dependency other than `diff` at runtime.
- Nothing listed under "Explicitly not in v0.1".

## Git workflow

- The repo has no commits; commit directly on `main` (there is nothing to
  protect yet). One commit per step.
- Message style: conventional commits, e.g. `feat(overlay): paint added and removed lines on review files`.
- Do NOT push, add a remote, or publish unless the operator instructed it.

## Steps

### Step 1: Scaffold the extension

Create `package.json` exactly as follows (then let npm add the dependency
versions):

```json
{
  "name": "git-axon",
  "displayName": "Git Axon",
  "description": "Review ahead commits by reading the final files, with the changes painted on top.",
  "version": "0.1.0",
  "publisher": "local-dev",
  "private": true,
  "engines": { "vscode": "^1.90.0" },
  "categories": ["SCM Providers", "Other"],
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "vscode:prepublish": "node esbuild.mjs --production",
    "package": "vsce package --no-dependencies"
  },
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "gitAxon", "title": "Git Axon", "icon": "media/axon.svg" }
      ]
    },
    "views": {
      "gitAxon": [
        { "id": "gitAxon.files", "name": "Review Files" },
        { "id": "gitAxon.commits", "name": "Commits" }
      ]
    },
    "viewsWelcome": [
      { "view": "gitAxon.files", "contents": "No changes to review.\n[Refresh](command:gitAxon.refresh)\n[Choose Base Ref](command:gitAxon.chooseBase)" }
    ],
    "commands": [
      { "command": "gitAxon.openAllFiles", "title": "Open All Review Files", "category": "Git Axon", "icon": "$(files)" },
      { "command": "gitAxon.reviewSelectedCommits", "title": "Review Selected Commits (Open Their Files)", "category": "Git Axon", "icon": "$(go-to-file)" },
      { "command": "gitAxon.reviewAhead", "title": "Review Ahead Commits", "category": "Git Axon", "icon": "$(arrow-up)" },
      { "command": "gitAxon.openDiff", "title": "Open Diff Against Baseline", "category": "Git Axon", "icon": "$(diff)" },
      { "command": "gitAxon.toggleOverlay", "title": "Toggle Change Overlay", "category": "Git Axon", "icon": "$(eye)" },
      { "command": "gitAxon.chooseBase", "title": "Choose Base Ref…", "category": "Git Axon" },
      { "command": "gitAxon.refresh", "title": "Refresh", "category": "Git Axon", "icon": "$(refresh)" },
      { "command": "gitAxon.openFile", "title": "Open Review File", "category": "Git Axon" }
    ],
    "menus": {
      "commandPalette": [
        { "command": "gitAxon.openFile", "when": "false" }
      ],
      "view/title": [
        { "command": "gitAxon.openAllFiles", "when": "view == gitAxon.files", "group": "navigation@1" },
        { "command": "gitAxon.reviewAhead", "when": "view == gitAxon.files", "group": "navigation@2" },
        { "command": "gitAxon.refresh", "when": "view == gitAxon.files", "group": "navigation@3" },
        { "command": "gitAxon.chooseBase", "when": "view == gitAxon.files" },
        { "command": "gitAxon.reviewSelectedCommits", "when": "view == gitAxon.commits", "group": "navigation@1" },
        { "command": "gitAxon.reviewAhead", "when": "view == gitAxon.commits", "group": "navigation@2" },
        { "command": "gitAxon.refresh", "when": "view == gitAxon.commits", "group": "navigation@3" }
      ],
      "view/item/context": [
        { "command": "gitAxon.reviewSelectedCommits", "when": "view == gitAxon.commits && viewItem == commit", "group": "inline" },
        { "command": "gitAxon.reviewSelectedCommits", "when": "view == gitAxon.commits && viewItem == commit", "group": "1_review" },
        { "command": "gitAxon.openDiff", "when": "view == gitAxon.files && viewItem == reviewFile", "group": "inline" }
      ],
      "editor/title": [
        { "command": "gitAxon.openDiff", "when": "gitAxon.isReviewFile", "group": "navigation@90" },
        { "command": "gitAxon.toggleOverlay", "when": "gitAxon.isReviewFile", "group": "navigation@91" }
      ]
    },
    "colors": [
      { "id": "gitAxon.addedLineBackground", "description": "Background of added or modified lines in a review file.", "defaults": { "dark": "#2ea04333", "light": "#2ea04326", "highContrast": "#2ea04355", "highContrastLight": "#2ea04340" } },
      { "id": "gitAxon.removedMarker", "description": "Colour of the removed-lines marker and badge in a review file.", "defaults": { "dark": "#f85149", "light": "#cf222e", "highContrast": "#ff7b72", "highContrastLight": "#a40e26" } }
    ],
    "configuration": {
      "title": "Git Axon",
      "properties": {
        "gitAxon.baseRef": { "type": "string", "default": "", "description": "Branch or ref to compare with. Empty = the current branch's upstream, then origin's default branch." },
        "gitAxon.includeUntracked": { "type": "boolean", "default": true, "description": "Include untracked (new, not ignored) files in the ahead review." },
        "gitAxon.historyLimit": { "type": "number", "default": 100, "minimum": 1, "description": "How many commits the Commits view lists." },
        "gitAxon.openAllConfirmThreshold": { "type": "number", "default": 25, "minimum": 1, "description": "Ask before opening more than this many files at once." },
        "gitAxon.autoOpenFiles": { "type": "boolean", "default": false, "description": "Open all review files automatically when the window starts." }
      }
    }
  }
}
```

Then:

1. `npm install diff`
2. `npm install -D typescript @types/vscode@1.90.0 @types/node esbuild vitest @vscode/vsce`
   (`@types/vscode` must stay at `1.90.0` — it may never be newer than
   `engines.vscode`.)
3. `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022", "lib": ["ES2022"], "module": "ESNext",
       "moduleResolution": "Bundler", "strict": true, "noEmit": true,
       "skipLibCheck": true, "types": ["node"]
     },
     "include": ["src", "test"]
   }
   ```
4. `esbuild.mjs`:
   ```js
   import * as esbuild from 'esbuild';
   const production = process.argv.includes('--production');
   const watch = process.argv.includes('--watch');
   const ctx = await esbuild.context({
     entryPoints: ['src/extension.ts'], bundle: true, format: 'cjs',
     platform: 'node', target: 'node20', outfile: 'dist/extension.js',
     external: ['vscode'], sourcemap: !production, minify: production,
     logLevel: 'info',
   });
   if (watch) { await ctx.watch(); } else { await ctx.rebuild(); await ctx.dispose(); }
   ```
5. `.gitignore`: `node_modules/`, `dist/`, `*.vsix`.
6. `.vscodeignore`: `src/**`, `test/**`, `plans/**`, `node_modules/**`,
   `.vscode/**`, `esbuild.mjs`, `tsconfig.json`, `**/*.map`, `.gitignore`.
7. `.vscode/tasks.json`: one task, label `build`, `"type": "npm"`,
   `"script": "build"`. `.vscode/launch.json`: one configuration
   `"type": "extensionHost"`, `"request": "launch"`, name `Run Git Axon`,
   `"args": ["--extensionDevelopmentPath=${workspaceFolder}"]`,
   `"outFiles": ["${workspaceFolder}/dist/**/*.js"]`, `"preLaunchTask": "build"`.
8. `media/axon.svg` (24×24, single colour, VS Code recolours it):
   ```svg
   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8 7.5c5 1 3 8 8 9.2"/><path d="M12 4.5h7M12 8h4"/></svg>
   ```
9. `src/extension.ts` — a stub for now:
   `import * as vscode from 'vscode'; export function activate(_context: vscode.ExtensionContext): void {} export function deactivate(): void {}`

**Verify**: `npm run typecheck` → exit 0. `npm run build && test -f dist/extension.js && echo ok` → `ok`.

### Step 2: Pure parsers — `src/gitParse.ts` (+ tests)

No imports from `vscode` or `child_process`.

```ts
export type FileStatus = 'A' | 'M' | 'D' | 'R' | 'U'; // U = untracked
export interface ReviewFile { path: string; oldPath?: string; status: FileStatus; }
export interface CommitInfo {
  sha: string; shortSha: string; parents: string[];
  author: string; relDate: string; subject: string; ahead: boolean;
}
export const LOG_FORMAT = '%H%x1f%h%x1f%P%x1f%an%x1f%ar%x1f%s%x1e';
export function parseNameStatusZ(out: string): ReviewFile[];
export function parseLog(out: string): CommitInfo[]; // ahead is always false here
export function parseZList(out: string): string[];   // NUL-separated paths, no empties
```

- `parseNameStatusZ` input is the output of `git diff --name-status -M -z`:
  NUL-separated tokens. A token starting with `R` or `C` (e.g. `R100`) is
  followed by **two** path tokens (old, new); every other status by one.
  Mapping: `R…` → `{status:'R', oldPath, path:new}`; `C…` → `{status:'A', path:new}`;
  `T` → `'M'`; `A`/`M`/`D` as is; anything else → `'M'`.
- `parseLog` splits records on `\x1e`, trims leading whitespace/newlines of
  each record, skips empty ones, splits fields on `\x1f`. `parents` =
  the `%P` field split on spaces with empties removed.

Tests in `test/gitParse.test.ts` (`import { describe, it, expect } from 'vitest'`):
modified+added+deleted in one input; a rename (`R100\0a.ts\0b.ts\0`); a copy;
empty string → `[]`; a path containing spaces and a non-ASCII character;
`parseLog` with two records where the second is a root commit (empty `%P`)
and a subject containing a `|` and quotes; `parseZList` with trailing NUL.

**Verify**: `npm test` → all pass (≥ 7 tests). `npm run typecheck` → exit 0.

### Step 3: Line-change engine — `src/lineChanges.ts`, `src/hoverText.ts` (+ tests)

`src/lineChanges.ts` (imports only `diffLines` from `'diff'`):

```ts
export interface LineChange {
  kind: 'added' | 'modified' | 'removed';
  /** 0-based line in the CURRENT text. For 'removed': the line the removed text sat in front of. */
  startLine: number;
  /** Number of current lines covered. 0 for 'removed'. */
  lineCount: number;
  /** The baseline text that is gone ('' for 'added'). Ends with '\n' when the last line had one. */
  removedText: string;
}
export function computeLineChanges(baseText: string, currentText: string): LineChange[];
```

Algorithm — implement exactly this, do **not** use `structuredPatch` (its
zero-length hunk start numbers are ambiguous):

1. Replace `\r\n` with `\n` in both inputs. If they are equal return `[]`.
2. `parts = diffLines(base, current)`.
3. Walk with `line = 0`. `n(part)` = number of `\n` in `part.value`, plus 1
   if the value is non-empty and does not end in `\n` (do not rely on
   `part.count`).
   - unchanged part → `line += n`.
   - removed part immediately followed by an added part, **or** added part
     immediately followed by a removed part → one `modified` change:
     `startLine = line`, `lineCount = n(added)`, `removedText = removed.value`;
     then `line += n(added)` and skip both parts.
   - removed part alone → `removed` change at `startLine = line`, `lineCount 0`.
   - added part alone → `added` change, `lineCount = n`; `line += n`.

`src/hoverText.ts` (no imports):

```ts
/** Markdown for the hover: a fenced diff block of the removed lines. */
export function buildRemovedHover(removedText: string, maxLines = 40): string;
```

- Split `removedText` into lines (drop one trailing empty element caused by a
  final `\n`). Header: `**Git Axon** — N line(s) at baseline`. Body: a code
  fence with language `diff`, each line prefixed with `- `. If more than
  `maxLines`, keep the first `maxLines` and append `… K more lines` after the
  fence. The fence must be one backtick longer than the longest run of
  backticks in the text, minimum 3 — otherwise removed markdown breaks out of
  the block.

Tests — `test/lineChanges.test.ts`: identical → `[]`; pure addition in the
middle; addition at end of file; pure removal in the middle (check
`startLine` is the index of the line now at that position); removal of the
last lines (`startLine === number of remaining lines`); removal of the first
line (`startLine === 0`); a modification (1 line → 2 lines); two separate
changes in one file with correct `startLine` for the second; CRLF baseline vs
LF current with the same content → `[]`; empty baseline → one `added` change
covering every line. `test/hoverText.test.ts`: single line; truncation at
`maxLines` reports the right remainder; text containing ```` ``` ```` gets a
4-backtick fence.

**Verify**: `npm test` → all pass (≥ 20 tests total). `npm run typecheck` → exit 0.

### Step 4: Git access and review scope — `src/git.ts`, `src/scope.ts` (+ integration test)

`src/git.ts` (imports `node:child_process`, `node:util` only):

```ts
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
/** Runs git with execFile (never a shell). Rejects on non-zero exit. */
export function git(cwd: string, args: string[]): Promise<string>;
/** Same, but resolves undefined instead of rejecting. */
export function tryGit(cwd: string, args: string[]): Promise<string | undefined>;
```

Requirements: `execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })`.
`GIT_OPTIONAL_LOCKS=0` is required: without it `git diff` may rewrite
`.git/index`, which re-triggers the file watcher added in step 7. Never build
a command string; user-controlled values (refs, paths) are always separate
array elements, and paths always come after a `--` element.

`src/scope.ts` (imports `./git`, `./gitParse`, `node:path`, `node:fs`):

```ts
export interface ReviewScope {
  kind: 'ahead' | 'commits';
  baseline: string;        // SHA or EMPTY_TREE
  baseRef: string;         // e.g. 'origin/main'; '' for kind 'commits'
  label: string;           // shown as the Review Files view description
  aheadShas: string[];     // commits in baseline..HEAD (kind 'ahead'), else selected shas
  files: ReviewFile[];     // sorted by path
}
export function findRepoRoot(folder: string): Promise<string | undefined>;
export function resolveBaseRef(root: string, configured: string): Promise<string>;
export function buildAheadScope(root: string, configured: string, includeUntracked: boolean): Promise<ReviewScope>;
export function buildCommitsScope(root: string, selected: CommitInfo[]): Promise<ReviewScope>;
export function listCommits(root: string, limit: number, aheadShas: string[]): Promise<CommitInfo[]>;
export function readBaseText(root: string, baseline: string, file: ReviewFile): Promise<string>;
export function toRelPath(root: string, fsPath: string): string | undefined;
```

Exact git invocations:

| Need | Arguments |
|---|---|
| repo root | `rev-parse --show-toplevel` (trim; then `fs.realpathSync`) |
| HEAD exists? | `rev-parse --verify --quiet HEAD` |
| ref is a commit? | `rev-parse --verify --quiet <ref>^{commit}` |
| upstream | `rev-parse --abbrev-ref --symbolic-full-name @{upstream}` |
| origin default | `symbolic-ref --quiet --short refs/remotes/origin/HEAD` |
| merge base | `merge-base <baseRef> HEAD` |
| ahead commits | `rev-list <baseline>..HEAD` |
| changed vs working tree | `diff --name-status -M -z <baseline>` |
| untracked | `ls-files --others --exclude-standard -z` |
| one commit's files | `diff --name-status -M -z <firstParentOrEMPTY_TREE> <sha>` |
| log | `log -n <limit> --format=<LOG_FORMAT>` (skip entirely when HEAD does not exist) |
| baseline file text | `show <baseline>:<oldPath ?? path>` via `tryGit`, `''` on failure |

- `buildAheadScope` and `buildCommitsScope` implement the two "Review scope"
  sections of the specification above, literally.
- `buildCommitsScope` receives `selected` in log order (newest first); the
  oldest is the last element. Label: `1 selected commit` / `N selected commits`.
- Ahead label: `ahead of <baseRef> · N commit(s)`; when `aheadShas` is empty:
  `uncommitted changes vs <baseRef>`.
- `readBaseText` returns `''` without calling git for status `A` and `U`.
- `toRelPath`: `fs.realpathSync` the path (fall back to the input if it
  throws), `path.relative(root, …)`, convert `\` to `/`; return `undefined`
  if the result starts with `..` or is absolute. (macOS `/tmp` vs
  `/private/tmp` is why realpath is needed.)
- `listCommits` sets `ahead = aheadShas.includes(sha)`.

Integration test `test/scope.test.ts`: in `beforeAll`, create a temp repo
under `fs.mkdtempSync(path.join(os.tmpdir(), 'axon-'))` using the `git`
helper itself. Every commit command must carry
`-c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false`,
and init must be `init -b main`. Scenario: commit 1 on `main` with `a.txt`
(3 lines) and `gone.txt`; branch `feature`; commit 2 modifies `a.txt`;
commit 3 adds `b.txt` and deletes `gone.txt`; commit 4 renames `a.txt` to
`c.txt` (unchanged content, so rename detection is certain); then write an
untracked `new.txt` and an uncommitted edit to `b.txt`. Assert:

- `buildAheadScope(root, 'main', true)`: baseline = commit 1's SHA,
  `aheadShas.length === 3`, files contain `b.txt` (`A`), `gone.txt` (`D`),
  `c.txt` (`R`, `oldPath 'a.txt'`), `new.txt` (`U`).
- same with `includeUntracked = false` → no `new.txt`.
- `resolveBaseRef(root, '')` → `'main'` (no upstream, no origin).
- `buildCommitsScope` with only commit 3 → baseline = commit 2's SHA, files
  are exactly `b.txt` and `gone.txt`.
- `buildCommitsScope` with only commit 1 (root) → baseline = `EMPTY_TREE`.
- `readBaseText` for the `c.txt` entry returns commit 1's `a.txt` content.
- a second temp repo with `init` only (no commits):
  `buildAheadScope` does not throw and has `baseline === EMPTY_TREE`.

Remove the temp directories in `afterAll`.

**Verify**: `npm test` → all pass (≥ 27 tests total). `npm run typecheck` → exit 0.

### Step 5: Baseline content provider — `src/baseContent.ts`

- `export const BASE_SCHEME = 'git-axon';`
- `export function baseUri(file: ReviewFile, baseline: string): vscode.Uri` →
  `vscode.Uri.from({ scheme: BASE_SCHEME, path: '/' + file.path, query: JSON.stringify({ ref: baseline, path: file.oldPath ?? file.path, status: file.status }) })`
  (keeping the real file name in `path` gives the read-only document the
  right language mode).
- `export class BaseContentProvider implements vscode.TextDocumentContentProvider`
  with constructor `(getRoot: () => string | undefined)`; `provideTextDocumentContent`
  parses the query and returns `readBaseText(...)`. The query is untrusted
  (any link or extension can open a `git-axon:` URI) and `ref` goes to
  `git show`: return `''` unless the JSON parses, `path` is a string and
  `ref` passes `isSha` — a pure helper exported from `src/gitParse.ts`
  (`/^[0-9a-f]{40}([0-9a-f]{24})?$/`), unit-tested there.
- `export class BaseTextCache` — `get(root, baseline, file): Promise<string>`
  memoised in a `Map` keyed `` `${baseline}\0${file.oldPath ?? file.path}` ``;
  `clear()`.

**Verify**: `npm run typecheck` → exit 0. `npm run build` → exit 0.

### Step 6: Overlay controller — `src/overlay.ts`

```ts
export class OverlayController implements vscode.Disposable {
  constructor(cache: BaseTextCache, getState: () => { root: string; scope: ReviewScope } | undefined);
  enabled: boolean;
  refreshAll(): void;                               // every visible editor
  refreshEditor(editor: vscode.TextEditor): Promise<void>;
  reviewFileFor(doc: vscode.TextDocument): ReviewFile | undefined;
  dispose(): void;
}
```

Three decoration types, created once in the constructor:

- `addedType`: `{ isWholeLine: true, backgroundColor: new vscode.ThemeColor('gitAxon.addedLineBackground'), overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'), overviewRulerLane: vscode.OverviewRulerLane.Left }`
- `removedType`: `{ isWholeLine: true, borderStyle: 'solid', borderWidth: '2px 0 0 0', borderColor: new vscode.ThemeColor('gitAxon.removedMarker'), overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'), overviewRulerLane: vscode.OverviewRulerLane.Left }`
- `badgeType`: `{}` (carries only per-range `after` text)

`refreshEditor` logic:

1. If `!enabled`, no state, `doc.uri.scheme !== 'file'`, or
   `reviewFileFor(doc)` is undefined or has status `D` → set all three types
   to `[]` and return.
2. If `doc.lineCount > 20000` → clear and return. Get the base text from the
   cache; if its length is over 2,000,000 → clear and return.
3. `changes = computeLineChanges(baseText, doc.getText())`.
4. Build the ranges (`last = doc.lineCount - 1`):
   - A `hoverMessage` only fires over the decoration's text range, so
     ranges must cover the full line text — never end at column 0.
   - `added` / `modified` → `addedType` range from `(startLine, 0)` to the
     **end** of line `startLine + lineCount - 1`
     (`doc.lineAt(endLine).range.end`); `modified` also gets `hoverMessage`.
   - `removed` → `removedType` range = the whole anchor line
     (`doc.lineAt(Math.min(startLine, last)).range`) with `hoverMessage`.
   - `modified` and `removed` → `badgeType` zero-length range at the end of
     the anchor line (`doc.lineAt(anchor).range.end`) with the same
     `hoverMessage` and
     `renderOptions: { after: { contentText: '  −' + removedLineCount, color: new vscode.ThemeColor('gitAxon.removedMarker'), margin: '0 0 0 1.5em' } }`.
   - `hoverMessage` = `new vscode.MarkdownString(buildRemovedHover(removedText) + '\n\n[Open diff](command:gitAxon.openDiff)')`
     with `isTrusted = { enabledCommands: ['gitAxon.openDiff'] }`.
5. Guard against races: capture `doc.version` before the `await`; if it
   changed afterwards, return without applying (a newer refresh is coming).
6. `editor.setDecorations` for all three types.

`reviewFileFor` uses `toRelPath(root, doc.uri.fsPath)` and a
`Map<string, ReviewFile>` rebuilt whenever the scope object changes.

**Verify**: `npm run typecheck` → exit 0. `npm run build` → exit 0.
`grep -ln "from 'vscode'" src/*.ts | sort | tr '\n' ' '` → exactly
`src/baseContent.ts src/extension.ts src/overlay.ts` at this point.

### Step 7: Views and wiring — `src/views.ts`, `src/extension.ts`

`src/views.ts`:

- `FilesProvider implements vscode.TreeDataProvider<ReviewFile>` —
  `setScope(root, scope)`, flat children, `TreeItem` with
  `resourceUri = vscode.Uri.file(path.join(root, file.path))`, label =
  basename, description = `` `${dirname === '.' ? '' : dirname + ' · '}${status}` ``,
  `contextValue = 'reviewFile'`, `command = { command: 'gitAxon.openFile', title: 'Open', arguments: [file] }`.
- `CommitsProvider implements vscode.TreeDataProvider<CommitInfo>` —
  `setCommits(commits)`, `TreeItem` label = subject, description =
  `` `${shortSha} · ${author} · ${relDate}` ``, `iconPath = new vscode.ThemeIcon(ahead ? 'arrow-up' : 'git-commit')`,
  `contextValue = 'commit'`, `id = sha`, tooltip = full SHA.
  Also expose `commits` so selections can be ordered by log position.

`src/extension.ts` — `activate(context)`:

1. Find the repo: first workspace folder for which `findRepoRoot` succeeds.
   If none: register the commands as no-ops that show
   `Git Axon: no git repository in this workspace.` and return.
2. State: `root`, `scope`, `selectedShas: string[] | undefined` (set when the
   scope kind is `commits`), overlay `enabled` (persist in
   `context.workspaceState` key `gitAxon.overlayEnabled`, default `true`).
3. `async function rebuild()`:
   - if `selectedShas` is set: `listCommits`, keep those still present; if at
     least one remains → `buildCommitsScope`; else clear `selectedShas`.
   - otherwise `buildAheadScope(root, config.baseRef, config.includeUntracked)`.
   - if the baseline changed → `cache.clear()`.
   - `listCommits(root, historyLimit, aheadShasOfAheadScope)` → commits view.
     (For the `ahead` flag always use the ahead set, also in `commits` kind:
     compute it with `resolveBaseRef` + merge-base + rev-list, or keep the
     last ahead scope's `aheadShas`.)
   - update both providers, `filesView.description = scope.label`, the
     status-bar text, then `overlay.refreshAll()` and the context key.
   - Wrap in try/catch; on error show one `showErrorMessage` with the git
     stderr and keep the previous scope.
   - Serialise: if a rebuild is running, mark "dirty" and run once more when
     it ends (never run two in parallel). A caller that awaits `rebuild()`
     while one is running must get the in-flight promise, which resolves
     only after the re-run — otherwise `await rebuild(); openAll()` opens
     the previous scope's files.
4. Register: the content provider for `BASE_SCHEME`; both tree views with
   `vscode.window.createTreeView` (`gitAxon.commits` with
   `canSelectMany: true`); the status-bar item (command
   `gitAxon.files.focus`); all commands; everything pushed onto
   `context.subscriptions`.
5. Commands:
   - `gitAxon.openFile(file)`: status `D` →
     `showTextDocument(baseUri(file, scope.baseline), { preview: true })`;
     else `showTextDocument(fileUri, { preview: false })`; if that throws
     (binary) → `vscode.commands.executeCommand('vscode.open', fileUri)`.
   - `gitAxon.openAllFiles`: targets = files with status ≠ `D`. If none →
     information message. If `targets.length > openAllConfirmThreshold` →
     `showWarningMessage('Open N files?', { modal: true }, 'Open')`. Open
     sequentially inside `vscode.window.withProgress` (notification,
     cancellable) with `{ preview: false, preserveFocus: true }`, same binary
     fallback; finally focus the first target.
   - `gitAxon.reviewSelectedCommits(item?, items?)`: selection =
     `items?.length ? items : item ? (item is in commitsView.selection ? commitsView.selection : [item]) : commitsView.selection`. Empty →
     information message `Select one or more commits in the Commits view first.`
     Sort by index in `commitsProvider.commits`, set `selectedShas`,
     `await rebuild()`, then run the open-all logic.
   - `gitAxon.reviewAhead`: clear `selectedShas`, `rebuild()`.
   - `gitAxon.openDiff(arg?)`: from the editor title bar VS Code passes
     the editor's `vscode.Uri`, from the tree a `ReviewFile`, from the hover
     link nothing. So: `arg instanceof vscode.Uri` → look up the open
     document and use `overlay.reviewFileFor(doc)`; an object with string
     `path` and `status` → a ReviewFile; otherwise
     `overlay.reviewFileFor(activeEditor.document)`; none → information
     message. Then `vscode.commands.executeCommand('vscode.diff', baseUri(file, scope.baseline), fileUri, `${basename} (${scope.baseline.slice(0, 7)} ↔ working tree)`)`.
     For status `D` just open the base URI.
   - `gitAxon.toggleOverlay`: flip, persist, `overlay.refreshAll()`.
   - `gitAxon.chooseBase`: quick pick built from
     `git for-each-ref --format=%(refname:short) refs/heads refs/remotes`
     plus a first entry `Automatic (upstream / default branch)`; write the
     choice to `gitAxon.baseRef` with `ConfigurationTarget.Workspace`.
   - `gitAxon.refresh`: `cache.clear()`, `rebuild()`.
6. Events (all debounced with a small local `debounce(fn, ms)` helper):
   - `vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(root), '.git/{HEAD,index,ORIG_HEAD,refs/**}'))`
     create/change/delete → `rebuild` (500 ms).
   - `onDidSaveTextDocument` (file scheme, inside root) → `rebuild` (500 ms).
   - `onDidChangeTextDocument` → `overlay.refreshEditor` for the visible
     editors of that document (200 ms). If debouncers are kept per document,
     drop them in `onDidCloseTextDocument`.
   - `onDidChangeVisibleTextEditors` → `overlay.refreshAll()`.
   - `onDidChangeActiveTextEditor` →
     `setContext('gitAxon.isReviewFile', !!overlay.reviewFileFor(doc))`.
   - `onDidChangeConfiguration` affecting `gitAxon` → `rebuild`.
7. First `await rebuild()`; then if `gitAxon.autoOpenFiles` is true run the
   open-all logic once.

**Verify**: `npm run typecheck` → exit 0. `npm test` → all pass.
`npm run build` → exit 0.
`grep -c "registerCommand('gitAxon\." src/extension.ts` → `8`.
`node -e "const p=require('./package.json');const c=p.contributes.commands.map(x=>x.command);const s=require('fs').readFileSync('src/extension.ts','utf8');const m=c.filter(x=>!s.includes(\"'\"+x+\"'\"));console.log(m.length?'MISSING '+m:'ok')"` → `ok`.

### Step 8: README and manual smoke test

Write `README.md`: what Git Axon is (2–3 sentences from "Why this matters"),
the overlay legend (the table in the specification), the commands, the
settings, how to add keybindings for `gitAxon.toggleOverlay` and
`gitAxon.openDiff`, how to run it (`npm install`, press F5), and a
"Limitations" section listing: removed lines are shown as marker + hover
(VS Code API limit), non-contiguous commit selections, single repository
only.

Then run the manual smoke test. It cannot be automated in this plan; perform
it if you can drive VS Code (F5 → Extension Development Host, open any repo
with a feature branch ahead of its base). If you cannot, say so in your
report and list it as **not verified** — do not claim it passed.

1. Git Axon icon is in the activity bar; Review Files lists the files changed
   since the base; its description reads `ahead of … · N commits`.
2. Clicking a modified file opens the real file; added lines are green; a
   place where lines were removed has a red top line and a `−N` badge;
   hovering shows the old lines; the "Open diff" link opens the diff editor.
3. Typing in the file updates the green lines within about a second.
4. "Open All Review Files" opens one pinned tab per file.
5. In Commits, Cmd/Ctrl-click two commits → inline button → the Review Files
   description becomes `2 selected commits` and their files open.
6. "Review Ahead Commits" returns to the default scope.
7. "Toggle Change Overlay" removes and restores the colours.
8. Committing in a terminal updates both views without pressing Refresh.

**Verify**: `test -s README.md && echo ok` → `ok`; `npm run typecheck && npm test && npm run build` → exit 0.

### Step 9 (optional): Package a `.vsix`

`npm run package`. vsce may warn about the missing `repository` field and
`LICENSE`; if it prompts, re-run as
`npx vsce package --no-dependencies --allow-missing-repository --skip-license`
(check `npx vsce package --help` if a flag is rejected). Do **not** install
the `.vsix` into the operator's VS Code and do not publish it.

**Verify**: `ls git-axon-0.1.0.vsix` → the file is listed, and
`git status --porcelain | grep vsix` → no output (it is ignored).

## Test plan

- `test/gitParse.test.ts`, `test/lineChanges.test.ts`,
  `test/hoverText.test.ts`: pure unit tests, cases listed in steps 2–3.
- `test/scope.test.ts`: integration against real temporary git repositories,
  cases listed in step 4.
- No tests import `vscode`. UI behaviour is covered by the manual smoke test
  in step 8 only; extension-host tests are deferred (see Maintenance notes).
- Verification: `npm test` → all pass, at least 27 tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0 with ≥ 27 passing tests across 4 test files
- [ ] `npm run build` exits 0 and `dist/extension.js` exists
- [ ] `grep -ln "from 'vscode'" src/*.ts | sort | tr '\n' ' '` prints exactly `src/baseContent.ts src/extension.ts src/overlay.ts src/views.ts`
- [ ] `grep -rnE "exec\(|execSync\(|shell: *true" src/` returns no matches (git is only ever run through `execFile`)
- [ ] `grep -rnE "'(add|commit|checkout|reset|stash|push|fetch|pull|merge|rebase)'" src/ | grep -v "contextValue = 'commit'"` returns no matches (read-only on the repo; the tree item's `contextValue` is the one allowed hit)
- [ ] `node -p "Object.keys(require('./package.json').dependencies).join()"` prints `diff`
- [ ] `git status --porcelain` is empty and `git log --oneline | wc -l` ≥ 8
- [ ] The smoke test in step 8 is reported as passed, or explicitly as not verified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check finds existing source files in the repository.
- `tsc` from TypeScript 7 rejects the `tsconfig.json` given in step 1. Try
  once with `npm install -D typescript@5`; if that also fails, stop.
- `diffLines` from the installed `diff` version does not return an array of
  `{ value, added, removed }` objects when called with two strings.
- `vitest` or `esbuild` (both newer than the versions this plan's author
  knows well) reject the usage shown here and their own `--help`/README does
  not make the fix obvious.
- You find yourself wanting a webview, the Comments API, a custom editor, or
  a proposed API to render removed lines inline. That is the known API limit;
  the answer is the badge + hover in this plan.
- The file watcher causes `rebuild` to run in an endless loop (check that
  `GIT_OPTIONAL_LOCKS=0` is set; if it is and the loop persists, stop).
- Any step seems to require a git write command or a file outside the
  in-scope list.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Reviewer focus**: `computeLineChanges` line arithmetic (off-by-one at
  start/end of file), the `-z` rename parsing, and that every git call goes
  through `execFile` with paths after `--`.
- **Deferred on purpose**, in likely priority order:
  1. Blame-based precision for `commits` scope (highlight only lines whose
     last commit is in the selection) — removes the non-contiguous caveat.
  2. A "show all as one multi-file diff" command (VS Code's `vscode.changes`
     command) for reviewers who want the classic view occasionally.
  3. Multi-root / multi-repository support and `.git`-file worktrees.
  4. Extension-host tests with `@vscode/test-electron`.
  5. Licence, real `publisher`, `repository` field, Marketplace publishing —
     owner decisions.
- If inline rendering of removed lines becomes possible through a stable API
  (view zones / inline diff for extensions), `overlay.ts` is the only file
  that needs to change; `LineChange` already carries `removedText`.
- Raising `engines.vscode` requires raising `@types/vscode` to the same
  version, never above it.
