import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EMPTY_TREE, git } from '../src/git';
import { buildAheadScope, buildCommitsScope, listCommits, readBaseText, resolveBaseRef } from '../src/scope';

const ID = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false'];

let root = '';
let emptyRoot = '';
const sha: string[] = [];

async function commit(message: string): Promise<string> {
  await git(root, ['add', '-A']);
  await git(root, [...ID, 'commit', '-q', '-m', message]);
  return (await git(root, ['rev-parse', 'HEAD'])).trim();
}

beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'axon-')));
  emptyRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'axon-empty-')));
  await git(root, ['init', '-b', 'main']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\ntwo\nthree\n');
  fs.writeFileSync(path.join(root, 'gone.txt'), 'bye\n');
  sha.push(await commit('c1'));
  await git(root, ['checkout', '-q', '-b', 'feature']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\nTWO\nthree\n');
  sha.push(await commit('c2'));
  fs.writeFileSync(path.join(root, 'b.txt'), 'bee\n');
  fs.unlinkSync(path.join(root, 'gone.txt'));
  sha.push(await commit('c3'));
  fs.renameSync(path.join(root, 'a.txt'), path.join(root, 'c.txt'));
  sha.push(await commit('c4'));
  fs.writeFileSync(path.join(root, 'new.txt'), 'fresh\n');
  fs.writeFileSync(path.join(root, 'b.txt'), 'bee\nedited\n');

  await git(emptyRoot, ['init', '-b', 'main']);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(emptyRoot, { recursive: true, force: true });
});

describe('scope', () => {
  it('builds the ahead scope against main', async () => {
    const scope = await buildAheadScope(root, 'main', true);
    expect(scope.baseline).toBe(sha[0]);
    expect(scope.aheadShas).toHaveLength(3);
    const byPath = new Map(scope.files.map((f) => [f.path, f]));
    expect(byPath.get('b.txt')?.status).toBe('A');
    expect(byPath.get('gone.txt')?.status).toBe('D');
    expect(byPath.get('c.txt')).toMatchObject({ status: 'R', oldPath: 'a.txt' });
    expect(byPath.get('new.txt')?.status).toBe('U');
  });

  it('omits untracked files when includeUntracked is false', async () => {
    const scope = await buildAheadScope(root, 'main', false);
    expect(scope.files.find((f) => f.path === 'new.txt')).toBeUndefined();
  });

  it('resolves the base ref to main when there is no upstream or origin', async () => {
    expect(await resolveBaseRef(root, '')).toBe('main');
  });

  it('builds a commits scope for a single middle commit', async () => {
    const commits = await listCommits(root, 10, []);
    const c3 = commits.find((c) => c.sha === sha[2])!;
    const scope = await buildCommitsScope(root, [c3]);
    expect(scope.kind).toBe('commits');
    expect(scope.baseline).toBe(sha[1]);
    expect(scope.files.map((f) => f.path).sort()).toEqual(['b.txt', 'gone.txt']);
  });

  it('uses the empty tree as baseline for a root commit', async () => {
    const commits = await listCommits(root, 10, []);
    const c1 = commits.find((c) => c.sha === sha[0])!;
    const scope = await buildCommitsScope(root, [c1]);
    expect(scope.baseline).toBe(EMPTY_TREE);
  });

  it('reads the pre-rename baseline text for a renamed file', async () => {
    const scope = await buildAheadScope(root, 'main', true);
    const renamed = scope.files.find((f) => f.path === 'c.txt')!;
    expect(await readBaseText(root, scope.baseline, renamed)).toBe('one\ntwo\nthree\n');
  });

  it('flags ahead commits in the log', async () => {
    const scope = await buildAheadScope(root, 'main', true);
    const commits = await listCommits(root, 10, scope.aheadShas);
    expect(commits.filter((c) => c.ahead)).toHaveLength(3);
    expect(commits.find((c) => c.sha === sha[0])?.ahead).toBe(false);
  });

  it('uses the remote default branch and ignores the branch upstream', async () => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'axon-remote-')));
    try {
      await git(repo, ['init', '-b', 'feature']);
      fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
      await git(repo, ['add', '-A']);
      await git(repo, [...ID, 'commit', '-q', '-m', 'c1']);
      const head = (await git(repo, ['rev-parse', 'HEAD'])).trim();
      await git(repo, ['config', 'remote.origin.url', '/nonexistent']);
      await git(repo, ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
      await git(repo, ['update-ref', 'refs/remotes/origin/trunk', head]);
      await git(repo, ['update-ref', 'refs/remotes/origin/feature', head]);
      await git(repo, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk']);
      await git(repo, ['config', 'branch.feature.remote', 'origin']);
      await git(repo, ['config', 'branch.feature.merge', 'refs/heads/feature']);
      // sanity: the upstream really is origin/feature
      expect((await git(repo, ['rev-parse', '--abbrev-ref', '@{upstream}'])).trim()).toBe('origin/feature');
      expect(await resolveBaseRef(repo, '')).toBe('origin/trunk');
      // a session override wins; an unknown one falls back to the default branch
      expect(await resolveBaseRef(repo, 'origin/feature')).toBe('origin/feature');
      expect(await resolveBaseRef(repo, 'no-such-ref')).toBe('origin/trunk');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('does not throw on a repository without commits', async () => {
    const scope = await buildAheadScope(emptyRoot, '', true);
    expect(scope.baseline).toBe(EMPTY_TREE);
  });
});
