export type FileStatus = 'A' | 'M' | 'D' | 'R' | 'U'; // U = untracked

export interface ReviewFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  relDate: string;
  subject: string;
  ahead: boolean;
}

export const LOG_FORMAT = '%H%x1f%h%x1f%P%x1f%an%x1f%ar%x1f%s%x1e';

/** NUL-separated paths, no empty entries. */
export function parseZList(out: string): string[] {
  return out.split('\0').filter((s) => s.length > 0);
}

/** Parses the output of `git diff --name-status -M -z`. */
export function parseNameStatusZ(out: string): ReviewFile[] {
  const tokens = parseZList(out);
  const files: ReviewFile[] = [];
  let i = 0;
  while (i < tokens.length) {
    const code = tokens[i++];
    const letter = code.charAt(0);
    if (letter === 'R' || letter === 'C') {
      const oldPath = tokens[i++];
      const newPath = tokens[i++];
      if (oldPath === undefined || newPath === undefined) {
        break;
      }
      if (letter === 'R') {
        files.push({ status: 'R', oldPath, path: newPath });
      } else {
        files.push({ status: 'A', path: newPath });
      }
      continue;
    }
    const filePath = tokens[i++];
    if (filePath === undefined) {
      break;
    }
    const status = letter === 'A' || letter === 'M' || letter === 'D' ? letter : 'M';
    files.push({ status, path: filePath });
  }
  return files;
}

/** Parses `git log --format=LOG_FORMAT`. `ahead` is always false here. */
export function parseLog(out: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const raw of out.split('\x1e')) {
    const record = raw.replace(/^\s+/, '');
    if (record === '') {
      continue;
    }
    const [sha, shortSha, parents, author, relDate, subject] = record.split('\x1f');
    commits.push({
      sha,
      shortSha,
      parents: (parents ?? '').split(' ').filter((p) => p.length > 0),
      author: author ?? '',
      relDate: relDate ?? '',
      subject: subject ?? '',
      ahead: false,
    });
  }
  return commits;
}

/** True for a full git object id (SHA-1 or SHA-256, lowercase hex). */
export function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value);
}
