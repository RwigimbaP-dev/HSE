import { useState, useEffect } from 'react';
import Spinner from './Spinner';

/**
 * Fetches a PDF file and renders it in an <iframe> via a blob URL.
 *
 * Uses the native `fetch` API (not the axios instance) because the src
 * path is already a full path like "/api/induction/file/5". If we used
 * the axios instance (baseURL='/api') it would double the prefix to
 * "/api/api/induction/file/5" and 404.
 *
 * The visitor token header is attached manually so the request is
 * still authenticated.
 */
export default function PdfViewer({ src, title, height = 480, onLoad }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let objectUrl = null;
    let active = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Build headers — include visitor token if present
        const headers = {};
        const visitorToken = sessionStorage.getItem('hse_visitor_token');
        if (visitorToken) headers['X-Visitor-Token'] = visitorToken;

        const res = await fetch(src, { headers });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();

        if (!active) return; // component unmounted mid-fetch

        // Verify we actually got a PDF (or at least non-empty content)
        if (blob.size === 0) throw new Error('Empty response');

        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        onLoad?.();
      } catch (err) {
        if (!active) return;
        console.error('PdfViewer fetch error:', err);
        setError('Could not load the PDF. Please try opening it in a new tab.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    // Cleanup: revoke blob URL and mark inactive
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (loading) {
    return (
      <div style={{
        height,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--gray-50)', borderRadius: 10, gap: 12,
        border: '1px solid var(--gray-200)',
      }}>
        <Spinner size="lg" />
        <p style={{ fontSize: '0.875rem', color: 'var(--gray-500)' }}>Loading PDF…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', background: 'var(--danger-bg)', borderRadius: 10,
        gap: 8, border: '1px solid #feb2b2', padding: 24,
      }}>
        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
        <p style={{ fontSize: '0.875rem', color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
        <a href={src} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
          ↗ Open in new tab
        </a>
      </div>
    );
  }

  return (
    <iframe
      src={blobUrl}
      title={title}
      style={{ width: '100%', height, border: 'none', display: 'block', borderRadius: 8 }}
    />
  );
}
