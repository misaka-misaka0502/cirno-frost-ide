import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Maximize2,
  PanelRightClose,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import {
  GlobalWorkerOptions,
  PasswordResponses,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type WheelEvent
} from "react";
import { useIDEStore } from "../store/useIDEStore";
import type { OpenPdf } from "../types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type ZoomMode = "fit-width" | "custom";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

interface PdfPageCanvasProps {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  root: HTMLDivElement | null;
  viewportWidth: number;
  zoomMode: ZoomMode;
  customScale: number;
  rotation: number;
  onScale: (pageNumber: number, scale: number) => void;
}

function PdfPageCanvas({
  documentProxy,
  pageNumber,
  active,
  root,
  viewportWidth,
  zoomMode,
  customScale,
  rotation,
  onScale
}: PdfPageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [dimensions, setDimensions] = useState(() => {
    const width = Math.max(240, viewportWidth - 34);
    return { width, height: Math.round(width * 1.414) };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!active || !root || !host) {
      setNearViewport(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      {
        root,
        rootMargin: "900px 0px",
        threshold: 0
      }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [active, root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !active ||
      !nearViewport ||
      !canvas ||
      viewportWidth < 120
    ) {
      return;
    }

    let disposed = false;
    setRendering(true);
    setError("");
    renderTaskRef.current?.cancel();

    void (async () => {
      try {
        const page = await documentProxy.getPage(pageNumber);
        if (disposed) {
          return;
        }
        const baseViewport = page.getViewport({ scale: 1, rotation });
        const fitScale = clamp(
          (viewportWidth - 34) / baseViewport.width,
          0.25,
          3
        );
        const scale =
          zoomMode === "fit-width" ? fitScale : customScale;
        const viewport = page.getViewport({ scale, rotation });
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          throw new Error("无法创建 PDF 画布");
        }
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setDimensions({
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height)
        });
        onScale(pageNumber, scale);

        const task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform:
            pixelRatio === 1
              ? undefined
              : [pixelRatio, 0, 0, pixelRatio, 0, 0]
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!disposed) {
          setRendering(false);
        }
      } catch (renderError) {
        if (
          !disposed &&
          !(
            renderError instanceof Error &&
            renderError.name === "RenderingCancelledException"
          )
        ) {
          setRendering(false);
          setError(
            renderError instanceof Error
              ? renderError.message
              : "这一页没有渲染成功"
          );
        }
      }
    })();

    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [
    active,
    customScale,
    documentProxy,
    nearViewport,
    onScale,
    pageNumber,
    rotation,
    viewportWidth,
    zoomMode
  ]);

  return (
    <article
      ref={hostRef}
      className="pdf-page"
      data-pdf-page={pageNumber}
      style={{
        width: dimensions.width,
        minHeight: dimensions.height
      }}
    >
      <span className="pdf-page-number">{pageNumber}</span>
      {nearViewport && <canvas ref={canvasRef} />}
      {nearViewport && rendering && (
        <span className="pdf-page-rendering">
          <span className="spinner" />
          正在绘制
        </span>
      )}
      {error && <span className="pdf-page-error">{error}</span>}
    </article>
  );
}

interface PdfDocumentViewProps {
  pdf: OpenPdf;
  active: boolean;
  panelWidth: number;
  onChoosePdf: () => void;
}

function PdfDocumentView({
  pdf,
  active,
  panelWidth,
  onChoosePdf
}: PdfDocumentViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const scrollFrameRef = useRef(0);
  const pageInputFocusedRef = useRef(false);
  const [viewportElement, setViewportElement] =
    useState<HTMLDivElement | null>(null);
  const [documentProxy, setDocumentProxy] =
    useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageCount, setPageCount] = useState(0);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
  const [customScale, setCustomScale] = useState(1);
  const [displayScale, setDisplayScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const setViewportRef = useCallback((element: HTMLDivElement | null) => {
    viewportRef.current = element;
    setViewportElement(element);
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    setLoading(true);
    setProgress(0);
    setError("");

    void (async () => {
      try {
        const payload = await window.frost.pdf.read(pdf.path);
        if (disposed) {
          return;
        }
        loadingTask = getDocument({
          data: new Uint8Array(payload.data)
        });
        loadingTask.onProgress = ({
          loaded,
          total
        }: {
          loaded: number;
          total: number;
        }) => {
          if (!disposed && total > 0) {
            setProgress(Math.round((loaded / total) * 100));
          }
        };
        loadingTask.onPassword = (
          updatePassword: (password: string) => void,
          reason: number
        ) => {
          const password = window.prompt(
            reason === PasswordResponses.INCORRECT_PASSWORD
              ? "密码不对，再输入一次 PDF 密码："
              : "这个 PDF 受到密码保护，请输入密码："
          );
          if (password === null) {
            void loadingTask?.destroy();
            return;
          }
          updatePassword(password);
        };
        const loadedDocument = await loadingTask.promise;
        if (disposed) {
          await loadingTask.destroy();
          return;
        }
        setDocumentProxy(loadedDocument);
        setPageCount(loadedDocument.numPages);
      } catch (loadError) {
        if (!disposed) {
          setDocumentProxy(null);
          setPageCount(0);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "PDF 读取失败"
          );
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [pdf.path]);

  useLayoutEffect(() => {
    if (!active || !viewportRef.current) {
      return;
    }
    const viewport = viewportRef.current;
    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = scrollPositionRef.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(
    () => () => {
      cancelAnimationFrame(scrollFrameRef.current);
    },
    []
  );

  const detectCurrentPage = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const marker = viewport.getBoundingClientRect().top + 72;
    const pages = [
      ...viewport.querySelectorAll<HTMLElement>("[data-pdf-page]")
    ];
    const current =
      pages.find((page) => page.getBoundingClientRect().bottom > marker) ??
      pages.at(-1);
    const nextPage = Number(current?.dataset.pdfPage ?? 1);
    setPageNumber((previous) => {
      if (previous === nextPage) {
        return previous;
      }
      if (!pageInputFocusedRef.current) {
        setPageInput(String(nextPage));
      }
      return nextPage;
    });
  }, []);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    scrollPositionRef.current = viewport.scrollTop;
    cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(detectCurrentPage);
  };

  const goToPage = (nextPage: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !pageCount) {
      return;
    }
    const targetPage = clamp(Math.round(nextPage), 1, pageCount);
    const target = viewport.querySelector<HTMLElement>(
      `[data-pdf-page="${targetPage}"]`
    );
    if (target) {
      viewport.scrollTo({
        top: Math.max(0, target.offsetTop - 14),
        behavior: "smooth"
      });
    }
    setPageNumber(targetPage);
    setPageInput(String(targetPage));
  };

  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) {
      goToPage(parsed);
    } else {
      setPageInput(String(pageNumber));
    }
  };

  const changeZoom = (delta: number) => {
    const base = zoomMode === "fit-width" ? displayScale : customScale;
    setCustomScale(clamp(Math.round((base + delta) * 20) / 20, 0.25, 3));
    setZoomMode("custom");
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
  };

  const handleScale = useCallback(
    (renderedPage: number, scale: number) => {
      if (renderedPage === pageNumber || renderedPage === 1) {
        setDisplayScale(scale);
      }
    },
    [pageNumber]
  );

  return (
    <section
      className={`pdf-document-view ${active ? "active" : ""}`}
      aria-hidden={!active}
    >
      <div className="pdf-reader-toolbar">
        <div className="pdf-page-controls">
          <button
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1 || loading}
            title="跳到上一页"
            aria-label="跳到上一页"
          >
            <ChevronLeft size={15} />
          </button>
          <input
            value={pageInput}
            inputMode="numeric"
            aria-label="当前页码"
            onFocus={() => {
              pageInputFocusedRef.current = true;
            }}
            onChange={(event) =>
              setPageInput(event.target.value.replace(/\D/g, ""))
            }
            onBlur={() => {
              pageInputFocusedRef.current = false;
              commitPageInput();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitPageInput();
                event.currentTarget.blur();
              }
            }}
          />
          <span>/ {pageCount || "—"}</span>
          <button
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= pageCount || loading}
            title="跳到下一页"
            aria-label="跳到下一页"
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <span className="pdf-toolbar-separator" />
        <div className="pdf-zoom-controls">
          <button
            onClick={() => changeZoom(-0.1)}
            disabled={!documentProxy}
            title="缩小（也可按住 Ctrl 滚轮）"
            aria-label="缩小 PDF"
          >
            <ZoomOut size={14} />
          </button>
          <button
            className="pdf-zoom-label"
            onClick={() => setZoomMode("fit-width")}
            disabled={!documentProxy}
            title="点击恢复适合宽度"
          >
            {zoomMode === "fit-width"
              ? "适合宽度"
              : `${Math.round(displayScale * 100)}%`}
          </button>
          <button
            onClick={() => changeZoom(0.1)}
            disabled={!documentProxy}
            title="放大（也可按住 Ctrl 滚轮）"
            aria-label="放大 PDF"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoomMode("fit-width")}
            disabled={!documentProxy}
            title="适合面板宽度"
            aria-label="适合面板宽度"
          >
            <Maximize2 size={13} />
          </button>
          <button
            onClick={() => setRotation((value) => (value + 90) % 360)}
            disabled={!documentProxy}
            title="顺时针旋转"
            aria-label="顺时针旋转 PDF"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      <div
        ref={setViewportRef}
        className="pdf-reader-viewport"
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        {loading && (
          <div className="pdf-reader-state">
            <span className="spinner" />
            <strong>正在铺开 PDF…</strong>
            <small>{progress > 0 ? `${progress}%` : "读取本地文档"}</small>
          </div>
        )}
        {!loading && error && (
          <div className="pdf-reader-state error">
            <FileText size={30} />
            <strong>这份 PDF 没有打开</strong>
            <small>{error}</small>
            <button onClick={onChoosePdf}>选择其他 PDF</button>
          </div>
        )}
        {documentProxy && !error && (
          <div className="pdf-pages">
            {Array.from({ length: pageCount }, (_, index) => (
              <PdfPageCanvas
                key={index + 1}
                documentProxy={documentProxy}
                pageNumber={index + 1}
                active={active}
                root={viewportElement}
                viewportWidth={panelWidth}
                zoomMode={zoomMode}
                customScale={customScale}
                rotation={rotation}
                onScale={handleScale}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

interface PdfReaderPanelProps {
  width: number;
}

export function PdfReaderPanel({ width }: PdfReaderPanelProps) {
  const openPdfs = useIDEStore((state) => state.openPdfs);
  const activePdf = useIDEStore((state) => state.activePdf);
  const pdfVisible = useIDEStore((state) => state.pdfVisible);
  const openPdf = useIDEStore((state) => state.openPdf);
  const selectPdf = useIDEStore((state) => state.selectPdf);
  const closePdf = useIDEStore((state) => state.closePdf);
  const setPdfVisible = useIDEStore((state) => state.setPdfVisible);
  const pushToast = useIDEStore((state) => state.pushToast);

  const choosePdf = useCallback(async () => {
    try {
      const selected = await window.frost.pdf.choose();
      if (selected) {
        openPdf(selected);
      }
    } catch (chooseError) {
      pushToast({
        tone: "error",
        title: "无法打开 PDF",
        detail:
          chooseError instanceof Error
            ? chooseError.message
            : String(chooseError)
      });
    }
  }, [openPdf, pushToast]);

  if (!activePdf) {
    return null;
  }

  return (
    <aside
      className={`pdf-reader-panel ${pdfVisible ? "visible" : ""}`}
      aria-hidden={!pdfVisible}
      style={{
        width: pdfVisible ? width : 0,
        flexBasis: pdfVisible ? width : 0
      }}
    >
      <header className="pdf-reader-header">
        <span className="pdf-reader-file-icon">
          <FileText size={15} />
        </span>
        <label className="pdf-document-picker" title={activePdf.path}>
          <small>PDF REFERENCE · {openPdfs.length} OPEN</small>
          <select
            value={activePdf.path}
            onChange={(event) => selectPdf(event.target.value)}
            aria-label="选择正在阅读的 PDF"
          >
            {openPdfs.map((pdf) => (
              <option key={pdf.path} value={pdf.path}>
                {pdf.name}
              </option>
            ))}
          </select>
        </label>
        <div className="pdf-reader-header-actions">
          <button
            className="icon-button ghost tiny"
            onClick={() => void choosePdf()}
            title="再打开一个 PDF"
            aria-label="再打开一个 PDF"
          >
            <FolderOpen size={14} />
          </button>
          <button
            className="icon-button ghost tiny"
            onClick={() => closePdf(activePdf.path)}
            title="关闭当前 PDF"
            aria-label="关闭当前 PDF"
          >
            <X size={14} />
          </button>
          <button
            className="icon-button ghost tiny"
            onClick={() => setPdfVisible(false)}
            title="收起 PDF 阅读器"
            aria-label="收起 PDF 阅读器"
          >
            <PanelRightClose size={15} />
          </button>
        </div>
      </header>

      <div className="pdf-document-stack">
        {openPdfs.map((pdf) => (
          <PdfDocumentView
            key={pdf.path}
            pdf={pdf}
            active={pdf.path === activePdf.path}
            panelWidth={width}
            onChoosePdf={() => void choosePdf()}
          />
        ))}
      </div>
    </aside>
  );
}
