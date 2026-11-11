import type { ReviewFile } from './gitParse';

export interface GroupRule {
  name: string;
  /** Regular expression tested against the repo-relative path (case-insensitive). */
  pattern: string;
}

export interface FileGroup {
  name: string;
  files: ReviewFile[];
}

export const DEFAULT_GROUP_NAME = 'Regular Files';

/** Compiles a user-supplied pattern; undefined when it is empty or invalid. */
export function compileRegex(source: string | undefined): RegExp | undefined {
  const text = (source ?? '').trim();
  if (text === '') {
    return undefined;
  }
  try {
    return new RegExp(text, 'i');
  } catch {
    return undefined;
  }
}

/**
 * Turns what the user typed into a group pattern. A plain folder name or path
 * (letters, digits, `_`, `-`, `/` only — e.g. `__fixtures__` or `packages/api`)
 * becomes "any file inside that folder"; anything else is kept as a regular expression.
 */
export function toGroupPattern(input: string): string {
  const text = input.trim().replace(/^\/+|\/+$/g, '');
  if (/^[A-Za-z0-9_\-/]+$/.test(text)) {
    return `(^|/)${text}/`;
  }
  return input.trim();
}

export interface FileFolder {
  /** Repo-relative directory, '' for the repository root. */
  dir: string;
  files: ReviewFile[];
}

/** Splits files by their directory, sorted by directory path (root first). */
export function groupByFolder(files: ReviewFile[]): FileFolder[] {
  const byDir = new Map<string, ReviewFile[]>();
  for (const file of files) {
    const cut = file.path.lastIndexOf('/');
    const dir = cut === -1 ? '' : file.path.slice(0, cut);
    const list = byDir.get(dir);
    if (list) {
      list.push(file);
    } else {
      byDir.set(dir, [file]);
    }
  }
  return [...byDir.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dir, list]) => ({ dir, files: list }));
}

/**
 * Splits files into groups. A file goes to the first rule whose pattern matches its path;
 * files matching no rule go to the default group, which is listed first. Empty groups are dropped.
 */
export function groupFiles(files: ReviewFile[], rules: GroupRule[], defaultName = DEFAULT_GROUP_NAME): FileGroup[] {
  const compiled = rules
    .map((rule) => ({ name: rule.name, regex: compileRegex(rule.pattern) }))
    .filter((rule): rule is { name: string; regex: RegExp } => rule.regex !== undefined && rule.name !== '');
  const fallback: FileGroup = { name: defaultName, files: [] };
  const byName = new Map<string, FileGroup>();
  const ordered: FileGroup[] = [fallback];
  for (const rule of compiled) {
    if (rule.name === defaultName) {
      byName.set(rule.name, fallback);
    } else if (!byName.has(rule.name)) {
      const group: FileGroup = { name: rule.name, files: [] };
      byName.set(rule.name, group);
      ordered.push(group);
    }
  }
  for (const file of files) {
    const rule = compiled.find((r) => r.regex.test(file.path));
    (rule ? byName.get(rule.name)! : fallback).files.push(file);
  }
  return ordered.filter((group) => group.files.length > 0);
}
