import {
  AlertCircle,
  AlertTriangle,
  CircleStop,
  Eraser,
  Info,
  PanelBottomClose,
  TerminalSquare,
  Trash2,
  X
} from "lucide-react";
import { terminalBus } from "../lib/terminalBus";
import { useIDEStore } from "../store/useIDEStore";
import type { CodeDiagnostic } from "../types";
import { TerminalSurface } from "./TerminalSurface";

function DiagnosticIcon({ diagnostic }: { diagnostic: CodeDiagnostic }) {
  if (diagnostic.severity === "error") {
    return <AlertCircle size={14} />;
  }
  if (diagnostic.severity === "warning") {
    return <AlertTriangle size={14} />;
  }
  return <Info size={14} />;
}

export function BottomPanel() {
  const terminals = useIDEStore((state) => state.terminals);
  const activeTerminalId = useIDEStore((state) => state.activeTerminalId);
  const diagnostics = useIDEStore((state) => state.diagnostics);
  const bottomPanelTab = useIDEStore((state) => state.bottomPanelTab);
  const setBottomPanelTab = useIDEStore((state) => state.setBottomPanelTab);
  const setActiveTerminal = useIDEStore((state) => state.setActiveTerminal);
  const removeTerminal = useIDEStore((state) => state.removeTerminal);
  const setBottomVisible = useIDEStore((state) => state.setBottomVisible);
  const activeTerminal = terminals.find(
    (terminal) => terminal.id === activeTerminalId
  );
  const errorCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length;
  const warningCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning"
  ).length;

  const closeTerminal = async (id: string) => {
    const terminal = terminals.find((item) => item.id === id);
    if (terminal?.state === "running") {
      await window.frost.terminal.kill(id);
    }
    removeTerminal(id);
    terminalBus.forget(id);
  };

  const stopActive = async () => {
    if (activeTerminal?.state === "running") {
      await window.frost.terminal.kill(activeTerminal.id);
    }
  };

  const clearExited = async () => {
    for (const terminal of terminals.filter(
      (item) => item.state === "exited"
    )) {
      await closeTerminal(terminal.id);
    }
  };

  return (
    <section className="bottom-panel">
      <div className="bottom-header">
        <div className="bottom-view-tabs">
          <button
            className={bottomPanelTab === "problems" ? "active" : ""}
            onClick={() => setBottomPanelTab("problems")}
          >
            <AlertCircle size={14} />
            问题
            <span>{diagnostics.length}</span>
          </button>
          <button
            className={bottomPanelTab === "output" ? "active" : ""}
            onClick={() => setBottomPanelTab("output")}
          >
            <TerminalSquare size={14} />
            运行与输出
            <span>{terminals.length}</span>
          </button>
        </div>

        {bottomPanelTab === "output" && (
          <div className="terminal-tabs">
            {terminals.map((terminal) => (
              <button
                className={`terminal-tab ${
                  terminal.id === activeTerminalId ? "active" : ""
                }`}
                key={terminal.id}
                onClick={() => setActiveTerminal(terminal.id)}
                title={terminal.label}
              >
                <span className={`session-dot ${terminal.state}`} />
                <span>{terminal.label}</span>
                <span
                  className="terminal-tab-close"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    void closeTerminal(terminal.id);
                  }}
                >
                  <X size={12} />
                </span>
              </button>
            ))}
          </div>
        )}

        {bottomPanelTab === "problems" && (
          <div className="problem-summary">
            <span className="error">
              <AlertCircle size={12} />
              {errorCount}
            </span>
            <span className="warning">
              <AlertTriangle size={12} />
              {warningCount}
            </span>
          </div>
        )}

        <div className="bottom-tools">
          {bottomPanelTab === "output" &&
            activeTerminal?.state === "running" && (
              <button
                className="icon-button ghost tiny"
                onClick={stopActive}
                title="停止运行"
              >
                <CircleStop size={15} />
              </button>
            )}
          {bottomPanelTab === "output" && activeTerminal && (
            <button
              className="icon-button ghost tiny"
              onClick={() => terminalBus.requestClear(activeTerminal.id)}
              title="清空显示"
            >
              <Eraser size={15} />
            </button>
          )}
          {bottomPanelTab === "output" &&
            terminals.some((terminal) => terminal.state === "exited") && (
              <button
                className="icon-button ghost tiny"
                onClick={clearExited}
                title="关闭已结束的运行"
              >
                <Trash2 size={14} />
              </button>
            )}
          <button
            className="icon-button ghost tiny"
            onClick={() => setBottomVisible(false)}
            title="收起面板"
          >
            <PanelBottomClose size={15} />
          </button>
        </div>
      </div>

      {bottomPanelTab === "problems" ? (
        <div className="problems-area">
          {diagnostics.length === 0 ? (
            <div className="problems-empty">
              <AlertCircle size={25} />
              <div>
                <strong>没有发现问题</strong>
                <span>Pyright 会实时检查当前打开的 Python 文件。</span>
              </div>
            </div>
          ) : (
            diagnostics.map((diagnostic) => (
              <div
                className={`problem-row ${diagnostic.severity}`}
                key={diagnostic.id}
                title={diagnostic.path}
              >
                <span className="problem-icon">
                  <DiagnosticIcon diagnostic={diagnostic} />
                </span>
                <span className="problem-message">{diagnostic.message}</span>
                <span className="problem-source">
                  {diagnostic.source}
                  {diagnostic.code ? ` (${diagnostic.code})` : ""}
                </span>
                <span className="problem-location">
                  {diagnostic.fileName}:{diagnostic.line}:{diagnostic.column}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bottom-terminal-area">
          {terminals.length === 0 ? (
            <div className="terminal-empty">
              <div className="terminal-empty-icon">
                <TerminalSquare size={24} />
              </div>
              <div>
                <strong>还没有运行任务</strong>
                <span>打开 Python 文件并按 F5，输出会出现在这里。</span>
              </div>
            </div>
          ) : (
            terminals.map((terminal) => (
              <div
                className={`terminal-slot ${
                  terminal.id === activeTerminalId ? "visible" : ""
                }`}
                key={terminal.id}
              >
                <TerminalSurface
                  sessionId={terminal.id}
                  visible={terminal.id === activeTerminalId}
                  fontSize={14}
                />
                {terminal.state === "exited" && (
                  <span className="terminal-exit-badge">
                    进程已结束 · 代码 {terminal.exitCode ?? 0}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
