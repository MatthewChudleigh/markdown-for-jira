import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderMarkdown } from '../static/panel/src/markdown.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFileSync(resolve(here, 'fixtures', name), 'utf8');

describe('renderMarkdown — GFM', () => {
  it('renders tables, task lists, fenced code, and autolinks', () => {
    const html = renderMarkdown(fx('gfm-basics.md'));
    expect(html).toContain('<table>');
    expect(html).toContain('<th>H1</th>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('class="hljs"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('renderMarkdown — security', () => {
  it('strips <script> and event handlers', () => {
    const html = renderMarkdown(fx('malicious-script.md'));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror=/i);
    expect(html).not.toMatch(/onclick=/i);
  });

  it('drops javascript: URLs', () => {
    const html = renderMarkdown(fx('malicious-script.md'));
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it('removes <iframe> and inline style', () => {
    const html = renderMarkdown(fx('embedded-html.md'));
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/style=/i);
    expect(html).not.toMatch(/onclick=/i);
  });
});

describe('renderMarkdown — frontmatter', () => {
  it('renders YAML frontmatter as a fenced code block', () => {
    const html = renderMarkdown(fx('frontmatter.md'));
    expect(html).toContain('title: Example');
    expect(html).toContain('<pre');
    expect(html).toContain('<h1>Body</h1>');
  });
});

describe('renderMarkdown — images', () => {
  it('strips relative <img> and keeps absolute ones', () => {
    const html = renderMarkdown(fx('relative-image.md'));
    expect(html).toContain('mdfj-missing-image');
    expect(html).toContain('[image: screenshot]');
    expect(html).toContain('<img');
    expect(html).toContain('src="https://example.com/pic.png"');
  });
});

describe('renderMarkdown — edge cases', () => {
  it('returns empty string for non-string input', () => {
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown(42)).toBe('');
  });
});
