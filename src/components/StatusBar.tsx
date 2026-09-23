import {
  Braces,
  AlertCircle,
  CheckCircle2,
  Cloud,
  PanelBottomOpen,
  Radio,
  Sparkles
} from "lucide-react";
import { useIDEStore } from "../store/useIDEStore";
import type { LspStatus } from "../types";

interface StatusBarProps {
  lspStatus: LspStatus;
}

export function StatusBar({ lspStatus }: StatusBarProps) {
  const cursor = useIDEStore((state) => state.cursor);
  const mode = useIDEStore((state) => state.mode);
  const workspace = useIDEStore((state) => state.workspace);
  const appInfo = useIDEStore((state) => state.appInfo);
  const bottomVisible = useIDEStore((state) => state.bottomVisible);
  const setBottomVisible = useIDEStore(
    (state) => state.setBottomVisible
  );
  const terminals = useIDEStore((state) => state.terminals);
  const diagnostics = useIDEStore((state) => state.diagnostics);
  const setBottomPanelTab = useIDEStore(
    (state) => state.setBottomPanelTab
  );
  const ready = lspStatus.state === "ready";

  return (
    <footer className="status-bar">
      <div className="status-left">
        <div className={`lsp-status ${ready ? "ready" : lspStatus.state}`}>
          {ready ? <Sparkles size={13} /> : <Radio size={13} />}
          <span>{ready ? "Pyright 智能补全" : lspStatus.message}</span>
        </div>
        <div className="status-item">
          <Cloud size={12} />
          {workspace ? "本地工作区" : "未打开工作区"}
        </div>
      </div>
      <div className="status-right">
        {mode === "files" && (
          <>
            <span className="status-item">
              行 {cursor.line}，列 {cursor.column}
            </span>
            <span className="status-item">空格: 4</span>
            <span className="status-item">UTF-8</span>
            <span className="status-item">
              <Braces size={12} />
              Python
            </span>
          </>
        )}
        <span className="status-item runtime">
          <CheckCircle2 size={12} />
          {appInfo?.pythonVersion ?? "…"}
        </span>
        <button
          className="status-button"
          onClick={() => setBottomPanelTab("problems")}
          title="显示实时语法检查结果 (Ctrl+Shift+M)"
        >
          <AlertCircle size={12} />
          {diagnostics.length}
        </button>
        <button
          className={`status-button ${bottomVisible ? "active" : ""}`}
          onClick={() => setBottomVisible(!bottomVisible)}
          title="切换底部面板 (Ctrl+J)"
        >
          <PanelBottomOpen size={13} />
          {terminals.length || ""}
        </button>
      </div>
    </footer>
  );
}
