import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import { full as emoji } from 'markdown-it-emoji';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function extractFrontmatter(src) {
  const m = src.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: null, body: src };
  return { frontmatter: m[1], body: src.slice(m[0].length) };
}

function createMd() {
  const md = new MarkdownIt({
    html: true, // raw HTML is sanitized post-render by DOMPurify
    linkify: true,
    breaks: false,
    typographer: false,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return (
            '<pre class="hljs"><code>' +
            hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
            '</code></pre>'
          );
        } catch {
          /* fall through */
        }
      }
      return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    },
  });

  md.use(taskLists, { enabled: false, label: true });
  md.use(emoji);

  // Make all links open in a new tab and safe against rel-attack.
  const defaultLinkOpen =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, _env, self) {
      return self.renderToken(tokens, idx, options);
    };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIdx = token.attrIndex('href');
    if (hrefIdx >= 0) {
      const href = token.attrs[hrefIdx][1];
      if (href && /^(https?:)?\/\//i.test(href)) {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  // Handle relative <img> sources: strip and replace with a linkified
  // placeholder (plan.md §4 v1 decision).
  const defaultImage = md.renderer.rules.image;
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const srcIdx = token.attrIndex('src');
    const src = srcIdx >= 0 ? token.attrs[srcIdx][1] : '';
    const isAbsolute = /^(https?:|data:)/i.test(src);
    if (!isAbsolute) {
      const alt = token.content || src || 'image';
      return `<span class="mdfj-missing-image">[image: ${md.utils.escapeHtml(alt)}]</span>`;
    }
    return defaultImage
      ? defaultImage(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
  };

  return md;
}

const md = createMd();

export function renderMarkdown(source) {
  if (typeof source !== 'string') return '';
  const { frontmatter, body } = extractFrontmatter(source);

  let prefix = '';
  if (frontmatter != null) {
    prefix = '<pre class="hljs"><code>' + md.utils.escapeHtml(frontmatter) + '</code></pre>\n';
  }

  const rendered = prefix + md.render(body);

  const clean = DOMPurify.sanitize(rendered, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
    ALLOW_DATA_ATTR: false,
  });

  return clean;
}
