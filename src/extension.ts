import * as path from 'node:path';
import * as vscode from 'vscode';
import { BASE_SCHEME, BaseContentProvider, BaseTextCache, baseUri } from './baseContent';
import { git } from './git';
import type { CommitInfo, ReviewFile } from './gitParse';
import { OverlayController } from './overlay';
import {
  buildAheadScope,
  buildCommitsScope,
  findRepoRoot,
  listCommits,
  toRelPath,
  type ReviewScope,
} from './scope';
import { CommitsProvider, FilesProvider } from './views';

const OVERLAY_KEY = 'gitAxon.overlayEnabled';
const COMMAND_IDS = [
  'gitAxon.openAllFiles',
  'gitAxon.reviewSelectedCommits',
  'gitAxon.reviewAhead',
  'gitAxon.openDiff',
  'gitAxon.toggleOverlay',
  'gitAxon.chooseBase',
  'gitAxon.refresh',
  'gitAxon.openFile',
];

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  };
}

async function findRepo(): Promise<string | undefined> {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== 'file') {
      continue;
    }
    const root = await findRepoRoot(folder.uri.fsPath);
    if (root) {
      return root;
    }
  }
  return undefined;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const root = await findRepo();
  if (!root) {
    for (const id of COMMAND_IDS) {
      context.subscriptions.push(
        vscode.commands.registerCommand(id, () => {
          void vscode.window.showInformationMessage('Git Axon: no git repository in this workspace.');
        }),
      );
    }
    return;
  }

  let scope: ReviewScope | undefined;
  let selectedShas: string[] | undefined;
  const cache = new BaseTextCache();
  const filesProvider = new FilesProvider();
  const commitsProvider = new CommitsProvider();
  const overlay = new OverlayController(cache, () => (scope ? { root, scope } : undefined));
  overlay.enabled = context.workspaceState.get<boolean>(OVERLAY_KEY, true);

  const filesView = vscode.window.createTreeView('gitAxon.files', { treeDataProvider: filesProvider });
  const commitsView = vscode.window.createTreeView('gitAxon.commits', {
    treeDataProvider: commitsProvider,
    canSelectMany: true,
  });
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.command = 'gitAxon.files.focus';

  const config = () => vscode.workspace.getConfiguration('gitAxon');

  function updateActiveContext(): void {
    const doc = vscode.window.activeTextEditor?.document;
    void vscode.commands.executeCommand('setContext', 'gitAxon.isReviewFile', !!doc && !!overlay.reviewFileFor(doc));
  }

  let inFlight: Promise<void> | undefined;
  let dirty = false;
  function rebuild(): Promise<void> {
    if (inFlight) {
      dirty = true;
      return inFlight;
    }
    inFlight = (async () => {
      try {
        do {
          dirty = false;
          await rebuildOnce();
        } while (dirty);
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  }

  async function rebuildOnce(): Promise<void> {
    try {
      const baseRefSetting = config().get<string>('baseRef', '');
      const includeUntracked = config().get<boolean>('includeUntracked', true);
      const historyLimit = config().get<number>('historyLimit', 100);

      const aheadScope = await buildAheadScope(root!, baseRefSetting, includeUntracked);
      const commits = await listCommits(root!, historyLimit, aheadScope.aheadShas);

      let next: ReviewScope = aheadScope;
      if (selectedShas) {
        const kept = commits.filter((c) => selectedShas!.includes(c.sha));
        if (kept.length > 0) {
          selectedShas = kept.map((c) => c.sha);
          next = await buildCommitsScope(root!, kept);
        } else {
          selectedShas = undefined;
        }
      }

      if (!scope || scope.baseline !== next.baseline) {
        cache.clear();
      }
      scope = next;
      filesProvider.setScope(root!, next);
      commitsProvider.setCommits(commits);
      filesView.description = next.label;
      statusBar.text = `$(git-compare) Axon: ${aheadScope.aheadShas.length}↑ · ${next.files.length} files`;
      statusBar.tooltip = next.label;
      statusBar.show();
      overlay.refreshAll();
      updateActiveContext();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Git Axon: ${message}`);
    }
  }

  async function openFileUri(uri: vscode.Uri, options: vscode.TextDocumentShowOptions): Promise<void> {
    try {
      await vscode.window.showTextDocument(uri, options);
    } catch {
      await vscode.commands.executeCommand('vscode.open', uri);
    }
  }

  function fileUri(file: ReviewFile): vscode.Uri {
    return vscode.Uri.file(path.join(root!, file.path));
  }

  async function openAll(): Promise<void> {
    if (!scope) {
      return;
    }
    const targets = scope.files.filter((f) => f.status !== 'D');
    if (targets.length === 0) {
      void vscode.window.showInformationMessage('Git Axon: no review files to open.');
      return;
    }
    const threshold = config().get<number>('openAllConfirmThreshold', 25);
    if (targets.length > threshold) {
      const answer = await vscode.window.showWarningMessage(`Open ${targets.length} files?`, { modal: true }, 'Open');
      if (answer !== 'Open') {
        return;
      }
    }
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Git Axon: opening review files', cancellable: true },
      async (progress, token) => {
        for (const file of targets) {
          if (token.isCancellationRequested) {
            break;
          }
          progress.report({ message: file.path, increment: 100 / targets.length });
          await openFileUri(fileUri(file), { preview: false, preserveFocus: true });
        }
      },
    );
    await openFileUri(fileUri(targets[0]), { preview: false });
  }

  const provider = new BaseContentProvider(() => root);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BASE_SCHEME, provider),
    filesView,
    commitsView,
    statusBar,
    overlay,
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('gitAxon.openFile', async (file: ReviewFile) => {
      if (!scope) {
        return;
      }
      if (file.status === 'D') {
        await vscode.window.showTextDocument(baseUri(file, scope.baseline), { preview: true });
        return;
      }
      await openFileUri(fileUri(file), { preview: false });
    }),
    vscode.commands.registerCommand('gitAxon.openAllFiles', () => openAll()),
    vscode.commands.registerCommand('gitAxon.reviewSelectedCommits', async (item?: CommitInfo, items?: CommitInfo[]) => {
      const selection = items?.length
        ? items
        : item
          ? commitsView.selection.some((s) => s.sha === item.sha)
            ? [...commitsView.selection]
            : [item]
          : [...commitsView.selection];
      if (selection.length === 0) {
        void vscode.window.showInformationMessage('Select one or more commits in the Commits view first.');
        return;
      }
      const order = (c: CommitInfo) => commitsProvider.commits.findIndex((x) => x.sha === c.sha);
      selectedShas = [...selection].sort((a, b) => order(a) - order(b)).map((c) => c.sha);
      await rebuild();
      await openAll();
    }),
    vscode.commands.registerCommand('gitAxon.reviewAhead', async () => {
      selectedShas = undefined;
      await rebuild();
    }),
    vscode.commands.registerCommand('gitAxon.openDiff', async (arg?: unknown) => {
      let file: ReviewFile | undefined;
      if (arg instanceof vscode.Uri) {
        const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === arg.toString());
        file = doc ? overlay.reviewFileFor(doc) : undefined;
      } else if (
        arg !== null &&
        typeof arg === 'object' &&
        typeof (arg as ReviewFile).path === 'string' &&
        typeof (arg as ReviewFile).status === 'string'
      ) {
        file = arg as ReviewFile;
      } else if (vscode.window.activeTextEditor) {
        file = overlay.reviewFileFor(vscode.window.activeTextEditor.document);
      }
      if (!file || !scope) {
        void vscode.window.showInformationMessage('Git Axon: the active file is not a review file.');
        return;
      }
      if (file.status === 'D') {
        await vscode.window.showTextDocument(baseUri(file, scope.baseline), { preview: true });
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.diff',
        baseUri(file, scope.baseline),
        fileUri(file),
        `${path.posix.basename(file.path)} (${scope.baseline.slice(0, 7)} ↔ working tree)`,
      );
    }),
    vscode.commands.registerCommand('gitAxon.toggleOverlay', async () => {
      overlay.enabled = !overlay.enabled;
      await context.workspaceState.update(OVERLAY_KEY, overlay.enabled);
      overlay.refreshAll();
    }),
    vscode.commands.registerCommand('gitAxon.chooseBase', async () => {
      const AUTO = 'Automatic (upstream / default branch)';
      let refs: string[] = [];
      try {
        const out = await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes']);
        refs = out.split('\n').filter((r) => r.length > 0);
      } catch (err) {
        void vscode.window.showErrorMessage(`Git Axon: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      const pick = await vscode.window.showQuickPick([AUTO, ...refs], { placeHolder: 'Choose the base ref to compare with' });
      if (pick === undefined) {
        return;
      }
      await config().update('baseRef', pick === AUTO ? '' : pick, vscode.ConfigurationTarget.Workspace);
    }),
    vscode.commands.registerCommand('gitAxon.refresh', async () => {
      cache.clear();
      await rebuild();
    }),
  );

  const scheduleRebuild = debounce(() => void rebuild(), 500);
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(root), '.git/{HEAD,index,ORIG_HEAD,refs/**}'),
  );
  const pending = new Map<string, () => void>();
  function refreshDocument(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    let run = pending.get(key);
    if (!run) {
      run = debounce(() => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === doc) {
            void overlay.refreshEditor(editor);
          }
        }
      }, 200);
      pending.set(key, run);
    }
    run();
  }

  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(scheduleRebuild),
    watcher.onDidChange(scheduleRebuild),
    watcher.onDidDelete(scheduleRebuild),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.scheme === 'file' && toRelPath(root, doc.uri.fsPath) !== undefined) {
        scheduleRebuild();
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => refreshDocument(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => pending.delete(doc.uri.toString())),
    vscode.window.onDidChangeVisibleTextEditors(() => overlay.refreshAll()),
    vscode.window.onDidChangeActiveTextEditor(() => updateActiveContext()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitAxon')) {
        scheduleRebuild();
      }
    }),
  );

  await rebuild();
  if (config().get<boolean>('autoOpenFiles', false)) {
    await openAll();
  }
}

export function deactivate(): void {}
