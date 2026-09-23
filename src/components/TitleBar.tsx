import {
  BookOpen,
  ChevronDown,
  Code2,
  Minus,
  Play,
  RotateCcw,
  Snowflake,
  Square,
  TerminalSquare,
  X
} from "lucide-react";
import { useIDEStore } from "../store/useIDEStore";

interface TitleBarProps {
  onRun: () => void;
  onStop: () => void;
  onTogglePdf: () => void;
  onModeChange: (mode: "files" | "interactive") => void;
}

export function TitleBar({
  onRun,
  onStop,
  onTogglePdf,
  onModeChange
}: TitleBarProps) {
  const appInfo = useIDEStore((state) => state.appInfo);
  const workspace = useIDEStore((state) => state.workspace);
  const mode = useIDEStore((state) => state.mode);
  const documents = useIDEStore((state) => state.documents);
  const activeDocumentPath = useIDEStore(
    (state) => state.activeDocumentPath
  );
  const terminals = useIDEStore((state) => state.terminals);
  const activePdf = useIDEStore((state) => state.activePdf);
  const pdfVisible = useIDEStore((state) => state.pdfVisible);
  const activeDocument = documents.find(
    (document) => document.path === activeDocumentPath
  );
  const hasRunningTerminal = terminals.some(
    (terminal) => terminal.state === "running"
  );
  const canRun = Boolean(
    activeDocument?.path.toLowerCase().endsWith(".py")
  );

  return (
    <header className="title-bar">
      <div className="title-drag-region">
        <div className="title-logo">
          <span className="logo-orb">
            <Snowflake size={16} />
          </span>
          <span className="title-product">Frost</span>
        </div>
        <div className="title-project">
          <span>{workspace?.name ?? "未打开文件夹"}</span>
          <ChevronDown size={13} />
        </div>
      </div>

      <div className="title-actions">
        <div className="mode-switcher">
          <button
            className={mode === "files" ? "active" : ""}
            onClick={() => onModeChange("files")}
          >
            <Code2 size={14} />
            文件
          </button>
          <button
            className={mode === "interactive" ? "active" : ""}
            onClick={() => onModeChange("interactive")}
          >
            <TerminalSquare size={14} />
            交互
          </button>
        </div>

        <button
          className={`pdf-toggle-button ${pdfVisible ? "active" : ""}`}
          onClick={onTogglePdf}
          title={
            activePdf
              ? pdfVisible
                ? "收起 PDF 阅读器"
                : `继续阅读 ${activePdf.name}`
              : "打开 PDF 参考资料"
          }
        >
          <BookOpen size={14} />
          PDF
        </button>

        {mode === "files" ? (
          <button
            className="run-button"
            onClick={onRun}
            disabled={!canRun}
            title={canRun ? "运行当前 Python 文件 (F5)" : "请先打开 Python 文件"}
          >
            <Play size={15} fill="currentColor" />
            运行
          </button>
        ) : (
          <button
            className="run-button secondary"
            onClick={() => onModeChange("interactive")}
            title="新建交互环境"
          >
            <RotateCcw size={14} />
            新环境
          </button>
        )}

        {hasRunningTerminal && mode === "files" && (
          <button
            className="stop-button"
            onClick={onStop}
            title="停止当前运行"
          >
            <Square size={12} fill="currentColor" />
          </button>
        )}

        <div className="runtime-pill" title={appInfo?.pythonPath}>
          <span className="runtime-dot" />
          Python {appInfo?.pythonVersion ?? "…"}
        </div>
      </div>

      <div className="window-controls">
        <button
          onClick={() => window.frost.app.minimize()}
          aria-label="最小化"
        >
          <Minus size={15} />
        </button>
        <button
          onClick={() => window.frost.app.maximize()}
          aria-label="最大化"
        >
          <Square size={12} />
        </button>
        <button
          className="window-close"
          onClick={() => window.frost.app.close()}
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
