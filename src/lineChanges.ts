import { diffLines } from 'diff';

export interface LineChange {
  kind: 'added' | 'modified' | 'removed';
  /** 0-based line in the CURRENT text. For 'removed': the line the removed text sat in front of. */
  startLine: number;
  /** Number of current lines covered. 0 for 'removed'. */
  lineCount: number;
  /** The baseline text that is gone ('' for 'added'). Ends with '\n' when the last line had one. */
  removedText: string;
}

function lineCountOf(value: string): number {
  if (value === '') {
    return 0;
  }
  let n = 0;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 10) {
      n++;
    }
  }
  return value.endsWith('\n') ? n : n + 1;
}

export function computeLineChanges(baseText: string, currentText: string): LineChange[] {
  const base = baseText.replace(/\r\n/g, '\n');
  const current = currentText.replace(/\r\n/g, '\n');
  if (base === current) {
    return [];
  }
  const parts = diffLines(base, current);
  const changes: LineChange[] = [];
  let line = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    const n = lineCountOf(part.value);
    if (!part.added && !part.removed) {
      line += n;
    } else if (next && ((part.removed && next.added) || (part.added && next.removed))) {
      const added = part.added ? part : next;
      const removed = part.removed ? part : next;
      const addedCount = lineCountOf(added.value);
      changes.push({ kind: 'modified', startLine: line, lineCount: addedCount, removedText: removed.value });
      line += addedCount;
      i++;
    } else if (part.removed) {
      changes.push({ kind: 'removed', startLine: line, lineCount: 0, removedText: part.value });
    } else {
      changes.push({ kind: 'added', startLine: line, lineCount: n, removedText: '' });
      line += n;
    }
  }
  return changes;
}
