# Git Axon

Git Axon is a VS Code extension for reviewing the commits that are ahead of a base branch. GitHub, Sourcetree and the built-in SCM view show a review as diffs: only the changed hunks, away from the rest of the file. Git Axon opens the real, final, editable files and paints the changes on top of them, so you read the result and still see what changed.

## Overlay legend

The "before" text is the file at the baseline commit. The "after" text is the live editor buffer, so the overlay stays correct while you type.

| Change | What you see |
|---|---|
| Lines added | whole-line green background and a green mark in the overview ruler |
| Lines modified | whole-line green background; red ghost badge `−N` after the first line; hovering any of the lines shows the old text |
| Lines removed | red 2px line on top of the line that now follows the removal; red ghost badge `−N` after it; red mark in the overview ruler; hovering shows the removed text |

The hover shows the old lines (up to 40) and an "Open diff" link to the native diff editor.

Not overlaid: deleted files (clicking one opens its baseline content read-only), binary files, files over 20,000 lines or whose baseline text is over 2,000,000 characters.

## Views

- **Review Files**: the files under review. The view description shows the scope, for example `ahead of origin/main · 4 commits`.
- **Commits**: the last commits from HEAD, multi-select enabled. Commits that are ahead of the base show an up arrow.

The status bar shows `Axon: <ahead>↑ · <n> files`; click it to focus Review Files.

## Review scopes

- **ahead** (default): baseline is the merge-base of the base ref and HEAD. Review files are everything that differs between the baseline and the working tree, including uncommitted edits and (optionally) untracked files.
- **commits**: select commits in the Commits view and run "Review Selected Commits". The baseline is the first parent of the oldest selected commit, and the review files are the files those commits touched.

The base ref is always the default branch: `origin/HEAD`, then the first of `origin/main`, `origin/master`, `main`, `master`, otherwise `HEAD`. The current branch's upstream is not used. **Choose Base Ref for This Session…** overrides it until the window is reloaded.

## Commands

| Command | Title |
|---|---|
| `gitAxon.openAllFiles` | Open All Review Files |
| `gitAxon.reviewSelectedCommits` | Review Selected Commits (Open Their Files) |
| `gitAxon.reviewAhead` | Review Ahead Commits |
| `gitAxon.openDiff` | Open Diff Against Baseline |
| `gitAxon.toggleOverlay` | Toggle Change Overlay |
| `gitAxon.chooseBase` | Choose Base Ref for This Session… |
| `gitAxon.addFileGroup` | Add File Group… |
| `gitAxon.removeFileGroup` | Remove File Group |
| `gitAxon.toggleFolderView` | Toggle Folder View |
| `gitAxon.refresh` | Refresh |

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `gitAxon.fileGroups` | Test Files rule | Groups for the Review Files view: `{ name, pattern }`, pattern is a regular expression on the file path. Unmatched files are Regular Files. |
| `gitAxon.includeUntracked` | `true` | Include untracked, non-ignored files in the ahead review. |
| `gitAxon.colorizeExplorer` | `true` | Colour files changed since the base in the Explorer and on tabs: green = added, violet = modified, teal = renamed. Files with uncommitted changes keep VS Code's own Git colour. |
| `gitAxon.historyLimit` | `100` | How many commits the Commits view lists. |
| `gitAxon.openAllConfirmThreshold` | `25` | Ask before opening more files than this at once. |
| `gitAxon.autoOpenFiles` | `false` | Open all review files when the window starts. |

## Keybindings

No keybindings are contributed by default. Add your own in `keybindings.json`:

```json
[
  { "key": "ctrl+alt+o", "command": "gitAxon.toggleOverlay" },
  { "key": "ctrl+alt+d", "command": "gitAxon.openDiff", "when": "gitAxon.isReviewFile" }
]
```

## Run it

```sh
npm install
```

Then open this folder in VS Code and press F5 to start an Extension Development Host, and open a repository whose branch is ahead of its base.

## Limitations

- Removed lines are shown as a marker, a badge and a hover, not as inline red lines. VS Code does not let extensions insert multi-line view zones into a normal editor.
- For a non-contiguous selection of commits, the overlay also shows changes made to those files by the commits in between.
- Single repository only: the first workspace folder inside a git repository is used. Git worktrees and submodules where `.git` is a file are not watched automatically; use Refresh.
- The extension only reads the repository; it never stages, commits or checks out anything.
