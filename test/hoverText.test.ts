import { describe, it, expect } from 'vitest';
import { buildRemovedHover } from '../src/hoverText';

describe('buildRemovedHover', () => {
  it('renders a single line', () => {
    expect(buildRemovedHover('old\n')).toBe('**Git Axon** — 1 line at baseline\n\n```diff\n- old\n```');
  });

  it('truncates at maxLines and reports the remainder', () => {
    const text = Array.from({ length: 5 }, (_, i) => `l${i}`).join('\n') + '\n';
    const md = buildRemovedHover(text, 2);
    expect(md).toContain('5 lines at baseline');
    expect(md).toContain('- l0\n- l1\n```');
    expect(md).not.toContain('- l2');
    expect(md.endsWith('… 3 more lines')).toBe(true);
  });

  it('uses a 4-backtick fence when the text contains a 3-backtick fence', () => {
    const md = buildRemovedHover('```ts\ncode\n```\n');
    expect(md).toContain('````diff\n');
    expect(md.endsWith('\n````')).toBe(true);
  });
});
