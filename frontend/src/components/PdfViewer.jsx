import { useState, useEffect, useRef } from "react";
import * as pdfjsNs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import Spinner from "./Spinner";

// pdfjs-dist 3.x ships a UMD bundle; depending on the bundler the API is either
// on the namespace or on its default export.
const pdfjsLib = pdfjsNs.getDocument ? pdfjsNs : pdfjsNs.default;
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Phone-friendly PDF viewer.
 *
 * Mobile browsers (iOS Safari, Android Chrome) cannot show a PDF inside an
 * <iframe> — they show a blank box, only page 1, or start a download.
 * Instead we download the file and draw every page onto a <canvas> with
 * pdf.js, which behaves the same on every device.
 */
export default function PdfViewer({ src, title, height = 480, onLoad }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [pageCount, setPageCount] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc = null;
    const container = containerRef.current;

    (async () => {
      setStatus("loading");
      setProgress(0);
      if (container) container.innerHTML = "";
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        if (data.length === 0) throw new Error("Empty response");

        pdfDoc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        setPageCount(pdfDoc.numPages);

        const width = Math.max((container?.clientWidth || 320) - 16, 240);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= pdfDoc.numPages; n++) {
          const page = await pdfDoc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.cssText =
            "width:100%;height:auto;display:block;margin:0 auto 8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)";
          container?.appendChild(canvas);

          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
          if (cancelled) return;

          setProgress(Math.round((n / pdfDoc.numPages) * 100));
          if (n === 1) {
            setStatus("ready");
            onLoad?.();
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("PdfViewer error:", err);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDoc) pdfDoc.destroy();
      if (container) container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div style={{ position: "relative" }}>
      {status === "loading" && (
        <div
          style={{
            height,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--gray-50)",
            gap: 12,
          }}
        >
          <Spinner size="lg" />
          <p style={{ fontSize: "0.875rem", color: "var(--gray-500)" }}>
            Loading document…
          </p>
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--danger-bg)",
            gap: 10,
            padding: 24,
            minHeight: 160,
          }}
        >
          <span style={{ fontSize: "1.5rem" }}>⚠️</span>
          <p
            style={{
              fontSize: "0.875rem",
              color: "var(--danger)",
              textAlign: "center",
            }}
          >
            Could not display this document here.
          </p>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary btn-sm"
          >
            ↗ Open / download PDF
          </a>
        </div>
      )}

      {/* Pages are drawn into this scrollable box */}
      <div
        ref={containerRef}
        aria-label={title}
        style={{
          height: status === "ready" ? height : 0,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          background: "var(--gray-100)",
          padding: status === "ready" ? 8 : 0,
          display: status === "error" ? "none" : "block",
        }}
      />

      {status === "ready" && pageCount > 1 && progress < 100 && (
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 12,
            background: "rgba(0,0,0,.6)",
            color: "#fff",
            fontSize: "0.7rem",
            padding: "3px 8px",
            borderRadius: 12,
          }}
        >
          Loading pages… {progress}%
        </div>
      )}
    </div>
  );
}
