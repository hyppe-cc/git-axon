import * as path from 'node:path';
import * as vscode from 'vscode';
import type { CommitInfo, ReviewFile } from './gitParse';
import type { ReviewScope } from './scope';

export class FilesProvider implements vscode.TreeDataProvider<ReviewFile> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private root = '';
  private files: ReviewFile[] = [];

  setScope(root: string, scope: ReviewScope): void {
    this.root = root;
    this.files = scope.files;
    this.emitter.fire();
  }

  getChildren(element?: ReviewFile): ReviewFile[] {
    return element ? [] : this.files;
  }

  getTreeItem(file: ReviewFile): vscode.TreeItem {
    const dir = path.posix.dirname(file.path);
    const item = new vscode.TreeItem(path.posix.basename(file.path), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(path.join(this.root, file.path));
    item.description = `${dir === '.' ? '' : dir + ' · '}${file.status}`;
    item.contextValue = 'reviewFile';
    item.command = { command: 'gitAxon.openFile', title: 'Open', arguments: [file] };
    return item;
  }
}

export class CommitsProvider implements vscode.TreeDataProvider<CommitInfo> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  commits: CommitInfo[] = [];

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
    return item;
  }
}
