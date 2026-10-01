'use client';

import { useRef, useCallback } from 'react';
import type { CvDocument } from '@cv-helper/shared-types';
import { buildCvHtml } from '@/utils/buildCvHtml';

interface Props {
  cv: CvDocument;
  /** 'download' renders a download button that triggers print-to-PDF; 'preview' renders an inline iframe */
  mode?: 'download' | 'preview';
  className?: string;
}

export default function CVPreviewRenderer({ cv, mode = 'download', className }: Props) {
  const downloadingRef = useRef(false);

  const handleDownload = useCallback(() => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;

    const existingIframe = document.getElementById('cv-print-iframe');
    if (existingIframe) existingIframe.remove();

    const html = buildCvHtml(cv);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.id = 'cv-print-iframe';
    // Must have real dimensions so the browser lays out the document before printing
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;height:1123px;border:none;opacity:0;pointer-events:none;';

    const cleanup = () => {
      URL.revokeObjectURL(url);
      iframe.remove();
      downloadingRef.current = false;
    };

    iframe.onload = () => {
      if (!iframe.contentWindow) { cleanup(); return; }
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
      setTimeout(cleanup, 10000);
    };

    iframe.src = url;
    document.body.appendChild(iframe);
  }, [cv]);

  if (mode === 'preview') {
    return (
      <iframe
        className={className ?? 'w-full h-full'}
        style={{ border: 'none', width: '100%', height: '100%' }}
        srcDoc={buildCvHtml(cv)}
        title="CV Preview"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="px-4 py-1.5 text-sm font-medium rounded bg-gray-900 text-white hover:bg-gray-700 transition-colors"
    >
      Download PDF
    </button>
  );
}
