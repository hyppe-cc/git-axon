import * as fs from 'node:fs';
import * as path from 'node:path';
import { EMPTY_TREE, git, tryGit } from './git';
import {
  LOG_FORMAT,
  parseLog,
  parseNameStatusZ,
  parseZList,
  type CommitInfo,
  type ReviewFile,
} from './gitParse';

export interface ReviewScope {
  kind: 'ahead' | 'commits';
  baseline: string; // SHA or EMPTY_TREE
  baseRef: string; // e.g. 'origin/main'; '' for kind 'commits'
  label: string; // shown as the Review Files view description
  aheadShas: string[]; // commits in baseline..HEAD (kind 'ahead'), else selected shas
  files: ReviewFile[]; // sorted by path
}

function realpath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

export async function findRepoRoot(folder: string): Promise<string | undefined> {
  const out = await tryGit(folder, ['rev-parse', '--show-toplevel']);
  const top = out?.trim();
  return top ? realpath(top) : undefined;
}

async function hasHead(root: string): Promise<boolean> {
  return (await tryGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])) !== undefined;
}

async function isCommit(root: string, ref: string): Promise<boolean> {
  return (await tryGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])) !== undefined;
}

/**
 * The ref the work is compared with: the override if it resolves, else the remote's default
 * branch, else main/master. The current branch's upstream is deliberately NOT used.
 */
export async function resolveBaseRef(root: string, configured: string): Promise<string> {
  const cfg = configured.trim();
  if (cfg && (await isCommit(root, cfg))) {
    return cfg;
  }
  const originHead = (await tryGit(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']))?.trim();
  if (originHead && (await isCommit(root, originHead))) {
    return originHead;
  }
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    if (await isCommit(root, candidate)) {
      return candidate;
    }
  }
  return 'HEAD';
}

async function revParseCommit(root: string, ref: string): Promise<string | undefined> {
  return (await tryGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]))?.trim() || undefined;
}

async function untrackedFiles(root: string): Promise<ReviewFile[]> {
  const out = await git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return parseZList(out).map((p) => ({ path: p, status: 'U' as const }));
}

function sortFiles(files: ReviewFile[]): ReviewFile[] {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function diffAgainstWorkingTree(root: string, baseline: string): Promise<ReviewFile[]> {
  const out = await git(root, ['diff', '--name-status', '-M', '-z', baseline]);
  return parseNameStatusZ(out);
}

export async function buildAheadScope(
  root: string,
  configured: string,
  includeUntracked: boolean,
): Promise<ReviewScope> {
  const baseRef = await resolveBaseRef(root, configured);
  let baseline: string;
  let aheadShas: string[] = [];
  if (!(await hasHead(root))) {
    baseline = EMPTY_TREE;
  } else {
    const mergeBase = (await tryGit(root, ['merge-base', baseRef, 'HEAD']))?.trim();
    baseline = mergeBase || (await revParseCommit(root, baseRef)) || EMPTY_TREE;
    const revs = await tryGit(root, ['rev-list', `${baseline}..HEAD`]);
    aheadShas = (revs ?? '').split('\n').filter((s) => s.length > 0);
  }

  const files = await diffAgainstWorkingTree(root, baseline);
  if (includeUntracked) {
    const known = new Set(files.map((f) => f.path));
    for (const u of await untrackedFiles(root)) {
      if (!known.has(u.path)) {
        files.push(u);
      }
    }
  }

  const n = aheadShas.length;
  const label =
    n === 0 ? `uncommitted changes vs ${baseRef}` : `ahead of ${baseRef} · ${n} commit${n === 1 ? '' : 's'}`;
  return { kind: 'ahead', baseline, baseRef, label, aheadShas, files: sortFiles(files) };
}

export async function buildCommitsScope(root: string, selected: CommitInfo[]): Promise<ReviewScope> {
  const oldest = selected[selected.length - 1];
  const baseline = oldest.parents[0] ?? EMPTY_TREE;

  const touched = new Set<string>();
  for (const commit of selected) {
    const parent = commit.parents[0] ?? EMPTY_TREE;
    const out = await git(root, ['diff', '--name-status', '-M', '-z', parent, commit.sha]);
    for (const f of parseNameStatusZ(out)) {
      touched.add(f.path);
      if (f.oldPath) {
        touched.add(f.oldPath);
      }
    }
  }

  const files = (await diffAgainstWorkingTree(root, baseline)).filter(
    (f) => touched.has(f.path) || (f.oldPath !== undefined && touched.has(f.oldPath)),
  );
  const n = selected.length;
  return {
    kind: 'commits',
    baseline,
    baseRef: '',
    label: `${n} selected commit${n === 1 ? '' : 's'}`,
    aheadShas: selected.map((c) => c.sha),
    files: sortFiles(files),
  };
}

export async function listCommits(root: string, limit: number, aheadShas: string[]): Promise<CommitInfo[]> {
  if (!(await hasHead(root))) {
    return [];
  }
  const out = await git(root, ['log', '-n', String(limit), `--format=${LOG_FORMAT}`]);
  const ahead = new Set(aheadShas);
  return parseLog(out).map((c) => ({ ...c, ahead: ahead.has(c.sha) }));
}

export async function readBaseText(root: string, baseline: string, file: ReviewFile): Promise<string> {
  if (file.status === 'A' || file.status === 'U') {
    return '';
  }
  const text = await tryGit(root, ['show', `${baseline}:${file.oldPath ?? file.path}`]);
  return text ?? '';
}

export function toRelPath(root: string, fsPath: string): string | undefined {
  const rel = path.relative(root, realpath(fsPath)).split('\\').join('/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return undefined;
  }
  return rel;
}
