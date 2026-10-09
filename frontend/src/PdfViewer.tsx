import { Document, Page, pdfjs } from "react-pdf";
import { useMemo, useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCw } from "lucide-react";
import type { PDFPageProxy } from "pdfjs-dist";
import { viewportRect } from "./pdf-geometry";
export interface SourceSpan {
  documentId: string;
  page: number;
  quote: string;
  /** PDF user-space rectangles: x1, y1, x2, y2. */
  rects?: [number, number, number, number][];
}
import { animate, createScope, svg } from "animejs";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
export default function PdfViewer({
  bytes,
  page,
  onPage,
  source,
  expectedPages = 1,
}: {
  bytes: Uint8Array;
  page: number;
  onPage: (p: number) => void;
  source?: SourceSpan;
  expectedPages?: number;
}) {
  const [pages, setPages] = useState(expectedPages);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [width, setWidth] = useState(500);
  const [error, setError] = useState("");
  const [loadedPage, setLoadedPage] = useState<PDFPageProxy>();
  const [highlights, setHighlights] = useState<
    { left: number; top: number; width: number; height: number }[]
  >([]);
  const container = useRef<HTMLDivElement>(null);
  const file = useMemo(() => ({ data: bytes.slice() }), [bytes]);
  const options = useMemo(
    () => ({
      cMapUrl: "/pdf-assets/cmaps/",
      standardFontDataUrl: "/pdf-assets/standard_fonts/",
      wasmUrl: "/pdf-assets/wasm/",
    }),
    [],
  );
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(240, entries[0].contentRect.width - 48)),
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setHighlights([]);
    if (
      !loadedPage ||
      !source ||
      source.page !== page ||
      loadedPage.pageNumber !== page
    )
      return;
    void loadedPage
      .getTextContent()
      .then((content) => {
        if (cancelled) return;
        const items = content.items.filter(
          (item) => "str" in item && item.str.trim(),
        );
        const normalize = (str: string) =>
          str.normalize("NFKC").replace(/\s+/g, " ").trim();
        const quote = normalize(source.quote);
        let matching: typeof items = [];
        for (let start = 0; start < items.length && !matching.length; start++) {
          let text = "";
          for (let end = start; end < items.length; end++) {
            const item = items[end];
            if (!("str" in item)) continue;
            text = normalize(text + " " + item.str);
            if (text === quote) {
              matching = items.slice(start, end + 1);
              break;
            }
            if (text.length > quote.length) break;
          }
        }
        const viewport = loadedPage.getViewport({
          scale:
            (width * zoom) /
            loadedPage.getViewport({ scale: 1, rotation }).width,
          rotation,
        });
        if (source.rects?.length) {
          setHighlights(
            source.rects.map((rect) => viewportRect(viewport, rect)),
          );
          return;
        }
        setHighlights(
          matching.flatMap((item) => {
            if (!("str" in item)) return [];
            const x = item.transform[4],
              y = item.transform[5];
            return [
              viewportRect(viewport, [x, y, x + item.width, y + item.height]),
            ];
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setHighlights([]);
      });
    return () => {
      cancelled = true;
    };
  }, [loadedPage, page, rotation, width, zoom, source]);
  useEffect(() => {
    if (!container.current || !highlights.length) return;
    const scope = createScope({
      root: container,
      mediaQueries: { reduceMotion: "(prefers-reduced-motion: reduce)" },
    }).add((self) => {
      if (self?.matches.reduceMotion) return;
      animate(svg.createDrawable(".citation-outline"), {
        draw: ["0 0", "0 1"],
        duration: 400,
        ease: "outExpo",
      });
    });
    return () => scope.revert();
  }, [highlights]);
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <div className="page-controls">
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="zoom-controls">
          <button
            className="icon-button"
            aria-label="Zoom out"
            disabled={zoom <= 0.6}
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          >
            <Minus size={17} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom in"
            disabled={zoom >= 2}
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            <Plus size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Rotate document"
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            <RotateCw size={16} />
          </button>
        </div>
      </div>
      <div
        className="pdf-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable PDF page"
        ref={container}
      >
        {error ? (
          <div className="error-box" role="alert">
            {error}
          </div>
        ) : (
          <Document
            suspense={false}
            file={file}
            options={options}
            onLoadSuccess={(pdf) => {
              setPages(pdf.numPages);
              setError("");
            }}
            onLoadError={() =>
              setError("This PDF could not be displayed. Try another copy.")
            }
            loading={<p className="loading-text">Opening document…</p>}
          >
            <div className="pdf-page-wrap">
              <Page
                suspense={false}
                pageNumber={Math.min(page, pages)}
                width={width * zoom}
                rotate={rotation}
                renderAnnotationLayer={false}
                renderTextLayer
                onLoadSuccess={setLoadedPage}
              />
              {highlights.map((rect, i) => (
                <div
                  key={i}
                  className="citation-highlight"
                  style={rect}
                  aria-hidden="true"
                >
                  <svg width={rect.width} height={rect.height}>
                    <path
                      className="citation-outline"
                      d={`M0 0H${rect.width}V${rect.height}H0Z`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1}
                    />
                  </svg>
                </div>
              ))}
            </div>
          </Document>
        )}
      </div>
      {source && (
        <div className="citation-caption">
          <strong>Selected source · page {source.page}</strong>
          <span>{source.quote}</span>
          {!highlights.length && (
            <small>
              Read the quoted passage above; a precise highlight is unavailable.
            </small>
          )}
        </div>
      )}
    </div>
  );
}
