import * as vscode from 'vscode';
import type { BaseTextCache } from './baseContent';
import { buildRemovedHover } from './hoverText';
import type { ReviewFile } from './gitParse';
import { computeLineChanges } from './lineChanges';
import { toRelPath, type ReviewScope } from './scope';

const MAX_LINES = 20000;
const MAX_BASE_CHARS = 2_000_000;

type State = { root: string; scope: ReviewScope } | undefined;

function lineCountOfText(text: string): number {
  if (text === '') {
    return 0;
  }
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

export class OverlayController implements vscode.Disposable {
  enabled = true;

  private readonly addedType: vscode.TextEditorDecorationType;
  private readonly removedType: vscode.TextEditorDecorationType;
  private readonly badgeType: vscode.TextEditorDecorationType;
  private indexedScope: ReviewScope | undefined;
  private index = new Map<string, ReviewFile>();

  constructor(
    private readonly cache: BaseTextCache,
    private readonly getState: () => State,
  ) {
    this.addedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor('gitAxon.addedLineBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.removedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      borderStyle: 'solid',
      borderWidth: '2px 0 0 0',
      borderColor: new vscode.ThemeColor('gitAxon.removedMarker'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.badgeType = vscode.window.createTextEditorDecorationType({});
  }

  refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      void this.refreshEditor(editor);
    }
  }

  reviewFileFor(doc: vscode.TextDocument): ReviewFile | undefined {
    const state = this.getState();
    if (!state || doc.uri.scheme !== 'file') {
      return undefined;
    }
    if (this.indexedScope !== state.scope) {
      this.indexedScope = state.scope;
      this.index = new Map(state.scope.files.map((f) => [f.path, f]));
    }
    const rel = toRelPath(state.root, doc.uri.fsPath);
    return rel === undefined ? undefined : this.index.get(rel);
  }

  async refreshEditor(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const state = this.getState();
    const file = this.enabled && state ? this.reviewFileFor(doc) : undefined;
    if (!state || !file || file.status === 'D') {
      this.clear(editor);
      return;
    }
    if (doc.lineCount > MAX_LINES) {
      this.clear(editor);
      return;
    }
    const version = doc.version;
    const baseText = await this.cache.get(state.root, state.scope.baseline, file);
    if (baseText.length > MAX_BASE_CHARS) {
      this.clear(editor);
      return;
    }
    const changes = computeLineChanges(baseText, doc.getText());
    if (doc.version !== version) {
      return;
    }

    const last = doc.lineCount - 1;
    const added: vscode.DecorationOptions[] = [];
    const removed: vscode.DecorationOptions[] = [];
    const badges: vscode.DecorationOptions[] = [];

    for (const change of changes) {
      const hover = (): vscode.MarkdownString => {
        const md = new vscode.MarkdownString(
          buildRemovedHover(change.removedText) + '\n\n[Open diff](command:gitAxon.openDiff)',
        );
        md.isTrusted = { enabledCommands: ['gitAxon.openDiff'] };
        return md;
      };
      if (change.kind === 'added' || change.kind === 'modified') {
        const endLine = Math.min(change.startLine + change.lineCount - 1, last);
        const range = new vscode.Range(change.startLine, 0, endLine, 0);
        added.push(change.kind === 'modified' ? { range, hoverMessage: hover() } : { range });
      }
      if (change.kind === 'removed') {
        const anchor = Math.min(change.startLine, last);
        removed.push({ range: new vscode.Range(anchor, 0, anchor, 0), hoverMessage: hover() });
      }
      if (change.kind === 'modified' || change.kind === 'removed') {
        const anchor = Math.min(change.startLine, last);
        const end = doc.lineAt(anchor).range.end;
        badges.push({
          range: new vscode.Range(end, end),
          renderOptions: {
            after: {
              contentText: '  −' + lineCountOfText(change.removedText),
              color: new vscode.ThemeColor('gitAxon.removedMarker'),
              margin: '0 0 0 1.5em',
            },
          },
        });
      }
    }

    editor.setDecorations(this.addedType, added);
    editor.setDecorations(this.removedType, removed);
    editor.setDecorations(this.badgeType, badges);
  }

  private clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.addedType, []);
    editor.setDecorations(this.removedType, []);
    editor.setDecorations(this.badgeType, []);
  }

  dispose(): void {
    this.addedType.dispose();
    this.removedType.dispose();
    this.badgeType.dispose();
  }
}
