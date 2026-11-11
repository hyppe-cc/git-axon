import { execFile } from 'node:child_process';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Runs git with execFile (never a shell). Rejects on non-zero exit. */
export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = (stderr || '').toString().trim();
          reject(new Error(detail || error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** Same, but resolves undefined instead of rejecting. */
export async function tryGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    return await git(cwd, args);
  } catch {
    return undefined;
  }
}
