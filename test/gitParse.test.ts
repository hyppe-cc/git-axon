import { describe, it, expect } from 'vitest';
import { parseNameStatusZ, parseLog, parseZList } from '../src/gitParse';

describe('parseNameStatusZ', () => {
  it('parses modified, added and deleted together', () => {
    const out = 'M\0a.ts\0A\0b.ts\0D\0c.ts\0';
    expect(parseNameStatusZ(out)).toEqual([
      { status: 'M', path: 'a.ts' },
      { status: 'A', path: 'b.ts' },
      { status: 'D', path: 'c.ts' },
    ]);
  });

  it('parses a rename with two path tokens', () => {
    expect(parseNameStatusZ('R100\0a.ts\0b.ts\0M\0z.ts\0')).toEqual([
      { status: 'R', oldPath: 'a.ts', path: 'b.ts' },
      { status: 'M', path: 'z.ts' },
    ]);
  });

  it('parses a copy as an added file', () => {
    expect(parseNameStatusZ('C75\0a.ts\0copy.ts\0')).toEqual([{ status: 'A', path: 'copy.ts' }]);
  });

  it('maps type changes and unknown statuses to M', () => {
    expect(parseNameStatusZ('T\0a\0X\0b\0')).toEqual([
      { status: 'M', path: 'a' },
      { status: 'M', path: 'b' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseNameStatusZ('')).toEqual([]);
  });

  it('keeps spaces and non-ASCII characters in paths', () => {
    expect(parseNameStatusZ('M\0dir with space/año ü.ts\0')).toEqual([
      { status: 'M', path: 'dir with space/año ü.ts' },
    ]);
  });
});

describe('parseLog', () => {
  it('parses two records, the second a root commit, with odd subjects', () => {
    const out =
      'aaa111\x1fa111\x1fbbb222\x1fAnn\x1f2 days ago\x1ffix: a | b "quoted"\x1e\n' +
      'bbb222\x1fb222\x1f\x1fBob\x1f3 days ago\x1finitial\x1e\n';
    const commits = parseLog(out);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({
      sha: 'aaa111',
      shortSha: 'a111',
      parents: ['bbb222'],
      author: 'Ann',
      relDate: '2 days ago',
      subject: 'fix: a | b "quoted"',
      ahead: false,
    });
    expect(commits[1].parents).toEqual([]);
    expect(commits[1].subject).toBe('initial');
  });

  it('returns [] for empty output', () => {
    expect(parseLog('')).toEqual([]);
  });
});

describe('parseZList', () => {
  it('ignores the trailing NUL and empty entries', () => {
    expect(parseZList('a.txt\0b c.txt\0')).toEqual(['a.txt', 'b c.txt']);
  });
});
