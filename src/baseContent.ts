import * as vscode from 'vscode';
import { isSha, type ReviewFile } from './gitParse';
import { readBaseText } from './scope';

export const BASE_SCHEME = 'git-axon';

export function baseUri(file: ReviewFile, baseline: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: BASE_SCHEME,
    path: '/' + file.path,
    query: JSON.stringify({ ref: baseline, path: file.oldPath ?? file.path, status: file.status }),
  });
}

export class BaseContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly getRoot: () => string | undefined) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const root = this.getRoot();
    if (!root) {
      return '';
    }
    let q: { ref?: unknown; path?: unknown; status?: ReviewFile['status'] };
    try {
      q = JSON.parse(uri.query);
    } catch {
      return '';
    }
    if (!q || !isSha(q.ref) || typeof q.path !== 'string') {
      return '';
    }
    const file: ReviewFile = { path: q.path, status: q.status ?? 'M' };
    return readBaseText(root, q.ref, file);
  }
}

export class BaseTextCache {
  private readonly entries = new Map<string, Promise<string>>();

  get(root: string, baseline: string, file: ReviewFile): Promise<string> {
    const key = `${baseline}\0${file.oldPath ?? file.path}`;
    let hit = this.entries.get(key);
    if (!hit) {
      hit = readBaseText(root, baseline, file);
      this.entries.set(key, hit);
    }
    return hit;
  }

  clear(): void {
    this.entries.clear();
  }
}
