import { describe, it, expect } from 'vitest';
import { computeLineChanges } from '../src/lineChanges';

describe('computeLineChanges', () => {
  it('returns [] for identical text', () => {
    expect(computeLineChanges('a\nb\n', 'a\nb\n')).toEqual([]);
  });

  it('detects a pure addition in the middle', () => {
    expect(computeLineChanges('a\nc\n', 'a\nb\nc\n')).toEqual([
      { kind: 'added', startLine: 1, lineCount: 1, removedText: '' },
    ]);
  });

  it('detects an addition at the end of the file', () => {
    expect(computeLineChanges('a\nb\n', 'a\nb\nc\nd\n')).toEqual([
      { kind: 'added', startLine: 2, lineCount: 2, removedText: '' },
    ]);
  });

  it('detects a removal in the middle', () => {
    expect(computeLineChanges('a\nb\nc\n', 'a\nc\n')).toEqual([
      { kind: 'removed', startLine: 1, lineCount: 0, removedText: 'b\n' },
    ]);
  });

  it('detects removal of the last lines', () => {
    expect(computeLineChanges('a\nb\nc\n', 'a\n')).toEqual([
      { kind: 'removed', startLine: 1, lineCount: 0, removedText: 'b\nc\n' },
    ]);
  });

  it('detects removal of the first line', () => {
    expect(computeLineChanges('a\nb\n', 'b\n')).toEqual([
      { kind: 'removed', startLine: 0, lineCount: 0, removedText: 'a\n' },
    ]);
  });

  it('detects a modification (1 line becomes 2)', () => {
    expect(computeLineChanges('a\nb\nc\n', 'a\nB1\nB2\nc\n')).toEqual([
      { kind: 'modified', startLine: 1, lineCount: 2, removedText: 'b\n' },
    ]);
  });

  it('reports the right startLine for a second, separate change', () => {
    const base = 'a\nb\nc\nd\ne\n';
    const current = 'a\nX\nY\nb\nc\nd\n';
    expect(computeLineChanges(base, current)).toEqual([
      { kind: 'added', startLine: 1, lineCount: 2, removedText: '' },
      { kind: 'removed', startLine: 6, lineCount: 0, removedText: 'e\n' },
    ]);
  });

  it('ignores CRLF vs LF differences', () => {
    expect(computeLineChanges('a\r\nb\r\n', 'a\nb\n')).toEqual([]);
  });

  it('treats an empty baseline as one added change covering every line', () => {
    expect(computeLineChanges('', 'a\nb\nc\n')).toEqual([
      { kind: 'added', startLine: 0, lineCount: 3, removedText: '' },
    ]);
  });
});
