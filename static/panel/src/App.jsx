import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, view } from '@forge/bridge';
import { renderMarkdown } from './markdown.js';
import 'highlight.js/styles/github.css';

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function App() {
  const [attachments, setAttachments] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [content, setContent] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [listError, setListError] = useState(null);
  const [contentError, setContentError] = useState(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await invoke('listAttachments');
      if (res.error) {
        setListError(res.error);
        setAttachments([]);
      } else {
        setAttachments(res.attachments || []);
        if (res.attachments?.length && !selectedId) {
          setSelectedId(res.attachments[0].id);
        }
      }
    } catch (e) {
      console.error('[markdown-for-jira] listAttachments failed', e);
      setListError('Unable to load attachments.');
      setAttachments([]);
    } finally {
      setLoadingList(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadList();
    // intentional: only on mount; Refresh button re-invokes loadList.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId || !attachments) return;
    const att = attachments.find((a) => a.id === selectedId);
    if (!att) return;
    let cancelled = false;
    (async () => {
      setLoadingContent(true);
      setContentError(null);
      setContent(null);
      try {
        const res = await invoke('getAttachmentContent', { id: att.id, size: att.size });
        if (cancelled) return;
        if (res.error) {
          setContentError(res.error);
        } else {
          setContent(res.text);
        }
      } catch (e) {
        if (cancelled) return;
        console.error('[markdown-for-jira] getAttachmentContent failed', e);
        setContentError('Unable to load attachment content.');
      } finally {
        if (!cancelled) setLoadingContent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, attachments]);

  useEffect(() => {
    // Resize the iframe to fit content.
    if (view?.resize) {
      view.resize();
    }
  });

  const html = useMemo(() => (content ? renderMarkdown(content) : ''), [content]);

  return (
    <div className="mdfj-root">
      <header className="mdfj-header">
        <div className="mdfj-title">Markdown attachments</div>
        <button
          type="button"
          className="mdfj-refresh"
          onClick={() => {
            setSelectedId(null);
            setContent(null);
            loadList();
          }}
          disabled={loadingList}
        >
          Refresh
        </button>
      </header>

      {loadingList && <div className="mdfj-skeleton">Loading attachments…</div>}

      {!loadingList && listError && <div className="mdfj-error">{listError}</div>}

      {!loadingList && !listError && attachments && attachments.length === 0 && (
        <div className="mdfj-empty">
          No markdown attachments on this issue. Attach a <code>.md</code> file to render it
          here.
        </div>
      )}

      {!loadingList && attachments && attachments.length > 0 && (
        <>
          {attachments.length > 1 && (
            <label className="mdfj-selector">
              <span>File</span>
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {attachments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.filename} ({formatBytes(a.size)})
                  </option>
                ))}
              </select>
            </label>
          )}

          {loadingContent && <div className="mdfj-skeleton">Rendering…</div>}

          {!loadingContent && contentError && (
            <div className="mdfj-error">{contentError}</div>
          )}

          {!loadingContent && !contentError && html && (
            <article
              className="mdfj-content markdown-body"
              // Content is sanitized with DOMPurify in renderMarkdown().
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </>
      )}
    </div>
  );
}
