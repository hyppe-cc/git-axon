import { describe, it, expect } from 'vitest';
import { compileRegex, groupByFolder, groupFiles, toGroupPattern } from '../src/fileGroups';
import type { ReviewFile } from '../src/gitParse';

const f = (path: string): ReviewFile => ({ path, status: 'M' });
const files = [f('src/app.ts'), f('src/app.test.ts'), f('test/scope.test.ts'), f('README.md'), f('src/view.spec.tsx')];
const TESTS = { name: 'Test Files', pattern: '\\.(test|spec)\\.[^/]+$' };

describe('compileRegex', () => {
  it('returns undefined for empty or invalid patterns', () => {
    expect(compileRegex('')).toBeUndefined();
    expect(compileRegex('   ')).toBeUndefined();
    expect(compileRegex(undefined)).toBeUndefined();
    expect(compileRegex('(')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(compileRegex('readme')!.test('README.md')).toBe(true);
  });
});

describe('toGroupPattern', () => {
  it('turns a folder name into an inside-that-folder pattern', () => {
    const regex = compileRegex(toGroupPattern('__fixtures__'))!;
    expect(regex.test('src/__fixtures__/user.json')).toBe(true);
    expect(regex.test('__fixtures__/a.ts')).toBe(true);
    expect(regex.test('src/my__fixtures__/a.ts')).toBe(false);
    expect(regex.test('src/__fixtures__.ts')).toBe(false);
  });

  it('accepts a nested path and ignores surrounding slashes', () => {
    const regex = compileRegex(toGroupPattern('/packages/api/'))!;
    expect(regex.test('packages/api/src/index.ts')).toBe(true);
    expect(regex.test('packages/web/src/index.ts')).toBe(false);
  });

  it('keeps anything else as a regular expression', () => {
    expect(toGroupPattern(' \\.md$ ')).toBe('\\.md$');
    expect(toGroupPattern('.test.ts')).toBe('.test.ts');
  });
});

describe('groupByFolder', () => {
  it('groups by directory, root first, keeping file order', () => {
    const folders = groupByFolder([f('src/b.ts'), f('README.md'), f('src/a/x.ts'), f('src/a.ts'), f('package.json')]);
    expect(folders.map((x) => x.dir)).toEqual(['', 'src', 'src/a']);
    expect(folders[0].files.map((x) => x.path)).toEqual(['README.md', 'package.json']);
    expect(folders[1].files.map((x) => x.path)).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('returns [] for no files', () => {
    expect(groupByFolder([])).toEqual([]);
  });
});

describe('groupFiles', () => {
  it('puts unmatched files in the default group, listed first', () => {
    const groups = groupFiles(files, [TESTS]);
    expect(groups.map((g) => g.name)).toEqual(['Regular Files', 'Test Files']);
    expect(groups[0].files.map((x) => x.path)).toEqual(['src/app.ts', 'README.md']);
    expect(groups[1].files.map((x) => x.path)).toEqual(['src/app.test.ts', 'test/scope.test.ts', 'src/view.spec.tsx']);
  });

  it('uses the first matching rule and keeps rule order', () => {
    const groups = groupFiles(files, [TESTS, { name: 'Docs', pattern: '\\.md$' }, { name: 'Late', pattern: 'test' }]);
    expect(groups.map((g) => g.name)).toEqual(['Regular Files', 'Test Files', 'Docs']);
  });

  it('drops empty groups and ignores invalid rules', () => {
    const groups = groupFiles([f('a.test.ts')], [TESTS, { name: 'Broken', pattern: '(' }]);
    expect(groups.map((g) => g.name)).toEqual(['Test Files']);
  });

  it('lets a rule named like the default group feed the default group', () => {
    const groups = groupFiles(files, [{ name: 'Regular Files', pattern: '\\.md$' }, TESTS]);
    expect(groups[0].files.map((x) => x.path)).toEqual(['src/app.ts', 'README.md']);
  });
});
