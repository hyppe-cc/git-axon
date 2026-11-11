/** Markdown for the hover: a fenced diff block of the removed lines. */
export function buildRemovedHover(removedText: string, maxLines = 40): string {
  const lines = removedText.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const total = lines.length;
  const shown = lines.slice(0, maxLines);
  let longestRun = 0;
  for (const run of removedText.match(/`+/g) ?? []) {
    longestRun = Math.max(longestRun, run.length);
  }
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const header = `**Git Axon** — ${total} line${total === 1 ? '' : 's'} at baseline`;
  const body = shown.map((l) => `- ${l}`).join('\n');
  let md = `${header}\n\n${fence}diff\n${body}\n${fence}`;
  if (total > maxLines) {
    md += `\n\n… ${total - maxLines} more lines`;
  }
  return md;
}
