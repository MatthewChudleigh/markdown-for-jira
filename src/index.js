import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];
const MARKDOWN_MIME_TYPES = new Set([
  'text/markdown',
  'text/x-markdown',
  'text/md',
]);

// Conservative cap. Forge resolver payloads are limited (~512 KB–1 MB
// depending on encoding). Returning decoded UTF-8 text raises the ceiling
// vs. base64, but we still refuse oversized attachments up front.
const MAX_ATTACHMENT_BYTES = 500 * 1024;

const resolver = new Resolver();

function isMarkdownAttachment(att) {
  if (!att || !att.filename) return false;
  const name = att.filename.toLowerCase();
  if (MARKDOWN_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  if (att.mimeType && MARKDOWN_MIME_TYPES.has(att.mimeType.toLowerCase())) return true;
  return false;
}

resolver.define('listAttachments', async ({ context }) => {
  const issueKey = context?.extension?.issue?.key;
  if (!issueKey) {
    return { error: 'No issue key in context.' };
  }

  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/issue/${issueKey}?fields=attachment`, {
      headers: { Accept: 'application/json' },
    });

  if (!res.ok) {
    return { error: `Failed to load issue (${res.status}).` };
  }

  const data = await res.json();
  const attachments = (data.fields?.attachment ?? [])
    .filter(isMarkdownAttachment)
    .map((a) => ({
      id: String(a.id),
      filename: a.filename,
      size: a.size ?? 0,
      mimeType: a.mimeType ?? '',
      created: a.created ?? null,
      author: a.author?.displayName ?? null,
    }));

  return { attachments };
});

resolver.define('getAttachmentContent', async ({ payload }) => {
  const id = payload?.id;
  const declaredSize = Number(payload?.size ?? 0);
  if (!id) {
    return { error: 'Missing attachment id.' };
  }

  if (declaredSize && declaredSize > MAX_ATTACHMENT_BYTES) {
    return {
      error: `Attachment is ${formatBytes(declaredSize)}; the ${formatBytes(
        MAX_ATTACHMENT_BYTES,
      )} size cap is exceeded.`,
      code: 'TOO_LARGE',
    };
  }

  const res = await api
    .asUser()
    .requestJira(route`/rest/api/3/attachment/content/${id}`, {
      redirect: 'follow',
    });

  if (!res.ok) {
    return { error: `Failed to fetch attachment (${res.status}).` };
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
    return {
      error: `Attachment is ${formatBytes(buf.byteLength)}; the ${formatBytes(
        MAX_ATTACHMENT_BYTES,
      )} size cap is exceeded.`,
      code: 'TOO_LARGE',
    };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { text, bytes: buf.byteLength };
  } catch {
    return {
      error: 'Attachment is not valid UTF-8 text.',
      code: 'ENCODING',
    };
  }
});

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export const handler = resolver.getDefinitions();
