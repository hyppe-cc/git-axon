import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CommitInfo, FileStatus, ReviewFile } from './gitParse';
import { groupByFolder, groupFiles, type FileFolder, type FileGroup, type GroupRule } from './fileGroups';
import type { ReviewScope } from './scope';

/** A directory node of the folder view; `key` keeps ids unique across file groups. */
interface FolderNode extends FileFolder {
  key: string;
}

export type FilesNode = ReviewFile | FileGroup | FolderNode;

function isFolder(node: FilesNode): node is FolderNode {
  return typeof (node as FolderNode).dir === 'string';
}

function isGroup(node: FilesNode): node is FileGroup {
  return !isFolder(node) && Array.isArray((node as FileGroup).files);
}

export class FilesProvider implements vscode.TreeDataProvider<FilesNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private root = '';
  private files: ReviewFile[] = [];
  private rules: GroupRule[] = [];
  private folderView = false;

  setScope(root: string, scope: ReviewScope, rules: GroupRule[]): void {
    this.root = root;
    this.files = scope.files;
    this.rules = rules;
    this.emitter.fire();
  }

  /** Folder view: list files under their directory instead of flat. */
  setFolderView(on: boolean): void {
    this.folderView = on;
    this.emitter.fire();
  }

  private leaves(files: ReviewFile[], key: string): FilesNode[] {
    if (!this.folderView) {
      return files;
    }
    return groupByFolder(files).map((folder) => ({ ...folder, key: `${key}/${folder.dir}` }));
  }

  getChildren(element?: FilesNode): FilesNode[] {
    if (!element) {
      const groups = groupFiles(this.files, this.rules);
      return groups.length > 1 ? groups : this.leaves(this.files, '');
    }
    if (isFolder(element)) {
      return element.files;
    }
    return isGroup(element) ? this.leaves(element.files, element.name) : [];
  }

  getTreeItem(node: FilesNode): vscode.TreeItem {
    if (isFolder(node)) {
      const folder = new vscode.TreeItem(node.dir === '' ? './' : node.dir, vscode.TreeItemCollapsibleState.Expanded);
      folder.id = `folder:${node.key}`;
      folder.iconPath = vscode.ThemeIcon.Folder;
      folder.description = String(node.files.length);
      folder.contextValue = 'fileFolder';
      return folder;
    }
    if (isGroup(node)) {
      const group = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
      group.id = `group:${node.name}`;
      group.description = String(node.files.length);
      group.contextValue = 'fileGroup';
      return group;
    }
    const file = node;
    const dir = path.posix.dirname(file.path);
    const item = new vscode.TreeItem(path.posix.basename(file.path), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(path.join(this.root, file.path));
    item.description = this.folderView || dir === '.' ? file.status : `${dir} · ${file.status}`;
    item.contextValue = 'reviewFile';
    item.command = { command: 'gitAxon.openFile', title: 'Open', arguments: [file] };
    return item;
  }
}

const STATUS_COLOR: Record<FileStatus, string> = {
  A: 'gitAxon.addedFileForeground',
  U: 'gitAxon.addedFileForeground',
  M: 'gitAxon.modifiedFileForeground',
  R: 'gitAxon.renamedFileForeground',
  D: 'gitAxon.modifiedFileForeground',
};

const STATUS_WORD: Record<FileStatus, string> = {
  A: 'Added',
  U: 'New (untracked)',
  M: 'Modified',
  R: 'Renamed',
  D: 'Deleted',
};

/** Colours and badges the files changed since the base, in the Explorer and on editor tabs. */
export class AheadDecorations implements vscode.FileDecorationProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this.emitter.event;
  private statuses = new Map<string, FileStatus>();
  private colorize = true;

  setScope(root: string, scope: ReviewScope, colorize: boolean): void {
    const next = new Map<string, FileStatus>();
    for (const file of scope.files) {
      if (file.status !== 'D') {
        next.set(path.join(root, file.path), file.status);
      }
    }
    const all = colorize !== this.colorize;
    const changed = [...new Set([...this.statuses.keys(), ...next.keys()])].filter(
      (p) => all || this.statuses.get(p) !== next.get(p),
    );
    this.statuses = next;
    this.colorize = colorize;
    if (changed.length > 0) {
      this.emitter.fire(changed.map((p) => vscode.Uri.file(p)));
    }
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const status = uri.scheme === 'file' ? this.statuses.get(uri.fsPath) : undefined;
    if (!status) {
      return undefined;
    }
    return {
      badge: '↑',
      tooltip: `${STATUS_WORD[status]} since the base (Git Axon)`,
      color: this.colorize ? new vscode.ThemeColor(STATUS_COLOR[status]) : undefined,
      propagate: this.colorize,
    };
  }
}

export class CommitsProvider implements vscode.TreeDataProvider<CommitInfo> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  commits: CommitInfo[] = [];
  /** SHAs of the commits currently under review; drives the checkboxes. */
  checked = new Set<string>();

  setChecked(checked: Set<string>): void {
    this.checked = checked;
    this.emitter.fire();
  }

  setCommits(commits: CommitInfo[]): void {
    this.commits = commits;
    this.emitter.fire();
  }

  getChildren(element?: CommitInfo): CommitInfo[] {
    return element ? [] : this.commits;
  }

  getTreeItem(commit: CommitInfo): vscode.TreeItem {
    const item = new vscode.TreeItem(commit.subject, vscode.TreeItemCollapsibleState.None);
    item.description = `${commit.shortSha} · ${commit.author} · ${commit.relDate}`;
    item.iconPath = new vscode.ThemeIcon(commit.ahead ? 'arrow-up' : 'git-commit');
    item.contextValue = 'commit';
    item.id = commit.sha;
    item.tooltip = commit.sha;
    item.checkboxState = this.checked.has(commit.sha)
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    item.command = { command: 'gitAxon.reviewCommit', title: 'Review Commit', arguments: [commit] };
    return item;
  }
}
