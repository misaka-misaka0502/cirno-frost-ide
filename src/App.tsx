import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityBar } from "./components/ActivityBar";
import { BottomPanel } from "./components/BottomPanel";
import { EditorWorkspace } from "./components/EditorWorkspace";
import { Explorer } from "./components/Explorer";
import { PackageManager } from "./components/PackageManager";
import { PackageSidebar } from "./components/PackageSidebar";
import { PdfReaderPanel } from "./components/PdfReaderPanel";
import { ReplWorkspace } from "./components/ReplWorkspace";
import { SettingsPanel } from "./components/SettingsPanel";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { StatusBar } from "./components/StatusBar";
import { TitleBar } from "./components/TitleBar";
import { ToastStack } from "./components/ToastStack";
import { frostLanguageService } from "./lib/lsp";
import { terminalBus } from "./lib/terminalBus";
import { normalizePythonFileName } from "./lib/pythonFileName";
import { useIDEStore } from "./store/useIDEStore";
import type {
  LspStatus,
  TerminalSession,
  WorkspaceInfo,
  WorkspaceMode
} from "./types";

export function App() {
  const activity = useIDEStore((state) => state.activity);
  const mode = useIDEStore((state) => state.mode);
  const workspace = useIDEStore((state) => state.workspace);
  const documents = useIDEStore((state) => state.documents);
  const bottomVisible = useIDEStore((state) => state.bottomVisible);
  const terminals = useIDEStore((state) => state.terminals);
  const activeTerminalId = useIDEStore(
    (state) => state.activeTerminalId
  );
  const replSessions = useIDEStore((state) => state.replSessions);
  const activePdf = useIDEStore((state) => state.activePdf);
  const pdfVisible = useIDEStore((state) => state.pdfVisible);
  const appInfo = useIDEStore((state) => state.appInfo);
  const setAppInfo = useIDEStore((state) => state.setAppInfo);
  const setWorkspace = useIDEStore((state) => state.setWorkspace);
  const setActivity = useIDEStore((state) => state.setActivity);
  const setMode = useIDEStore((state) => state.setMode);
  const setBottomVisible = useIDEStore(
    (state) => state.setBottomVisible
  );
  const setBottomPanelTab = useIDEStore(
    (state) => state.setBottomPanelTab
  );
  const openPdf = useIDEStore((state) => state.openPdf);
  const setPdfVisible = useIDEStore((state) => state.setPdfVisible);
  const createUntitledDocument = useIDEStore(
    (state) => state.createUntitledDocument
  );
  const addTerminal = useIDEStore((state) => state.addTerminal);
  const markTerminalExited = useIDEStore(
    (state) => state.markTerminalExited
  );
  const addRepl = useIDEStore((state) => state.addRepl);
  const markReplExited = useIDEStore(
    (state) => state.markReplExited
  );
  const pushToast = useIDEStore((state) => state.pushToast);
  const [lspStatus, setLspStatus] = useState<LspStatus>({
    state: "stopped",
    message: "打开文件夹后启动 Pyright"
  });
  const [bottomHeight, setBottomHeight] = useState(245);
  const [pdfWidth, setPdfWidth] = useState(470);
  const replSequence = useRef(1);
  const savingDocuments = useRef(new Map<string, Promise<boolean>>());
  const runStarting = useRef(false);

  useEffect(() => {
    let disposed = false;

    const unsubscribeTerminalData = window.frost.terminal.onData(
      ({ id, data }) => terminalBus.emit(id, data)
    );
    const unsubscribeTerminalExit = window.frost.terminal.onExit(
      ({ id, exitCode }) => {
        const state = useIDEStore.getState();
        if (state.terminals.some((terminal) => terminal.id === id)) {
          markTerminalExited(id, exitCode);
        }
        if (state.replSessions.some((terminal) => terminal.id === id)) {
          markReplExited(id, exitCode);
        }
      }
    );
    const unsubscribeLspStatus = window.frost.lsp.onStatus((status) => {
      setLspStatus(status);
      const ready = status.state === "ready";
      frostLanguageService.setReady(ready);
      if (ready) {
        for (const document of useIDEStore.getState().documents) {
          if (document.path.toLowerCase().endsWith(".py")) {
            frostLanguageService.openDocument(
              document.uri,
              document.content,
              document.version
            );
          }
        }
      }
    });

    void (async () => {
      try {
        const [appInfo, initialWorkspace] = await Promise.all([
          window.frost.app.getInfo(),
          window.frost.workspace.get()
        ]);
        if (disposed) {
          return;
        }
        setAppInfo(appInfo);
        setWorkspace(initialWorkspace);
        if (
          initialWorkspace &&
          appInfo.testAutoSavePath &&
          appInfo.testAutoSaveContent !== undefined
        ) {
          const original = await window.frost.workspace.readFile(
            appInfo.testAutoSavePath
          );
          const state = useIDEStore.getState();
          state.openDocument(appInfo.testAutoSavePath, original);
          state.updateDocument(
            appInfo.testAutoSavePath,
            appInfo.testAutoSaveContent
          );
        }
        if (initialWorkspace) {
          await window.frost.lsp.start(initialWorkspace.path);
        }
      } catch (error) {
        if (!disposed) {
          pushToast({
            tone: "error",
            title: "Frost IDE 启动遇到问题",
            detail: error instanceof Error ? error.message : String(error)
          });
        }
      }
    })();

    return () => {
      disposed = true;
      unsubscribeTerminalData();
      unsubscribeTerminalExit();
      unsubscribeLspStatus();
      frostLanguageService.setReady(false);
    };
  }, [
    markReplExited,
    markTerminalExited,
    pushToast,
    setAppInfo,
    setWorkspace
  ]);

  const saveDocument = useCallback(
    async (
      path?: string,
      silent = false,
      commitUntitled = false
    ) => {
      const state = useIDEStore.getState();
      const targetPath = path ?? state.activeDocumentPath;
      const document = state.documents.find(
        (item) => item.path === targetPath
      );
      if (!document) {
        return false;
      }
      if (document.isUntitled && !commitUntitled) {
        if (!silent) {
          pushToast({
            tone: "info",
            title: "请先确认文件名",
            detail: "在左侧资源管理器输入名称并按 Enter 后，文件才会保存。"
          });
        }
        return false;
      }
      const existingSave = savingDocuments.current.get(document.path);
      if (existingSave) {
        return existingSave;
      }
      const operation = (async () => {
        try {
          if (document.isUntitled) {
            const currentWorkspace = useIDEStore.getState().workspace;
            const name = normalizePythonFileName(
              document.draftName ?? document.name
            );
            if (!currentWorkspace || !name) {
              throw new Error(
                currentWorkspace
                  ? "请输入文件名后再保存"
                  : "请先打开工作区文件夹"
              );
            }
            const created = await window.frost.workspace.createFile(
              document.parentPath ?? currentWorkspace.path,
              name,
              document.content
            );
            const currentState = useIDEStore.getState();
            currentState.finalizeUntitledDocument(
              document.path,
              created.path,
              document.content
            );
            currentState.refreshExplorer();
            const finalized = useIDEStore
              .getState()
              .documents.find((item) => item.path === created.path);
            if (
              finalized &&
              finalized.path.toLowerCase().endsWith(".py")
            ) {
              frostLanguageService.openDocument(
                finalized.uri,
                finalized.content,
                finalized.version
              );
            }
            return true;
          }

          await window.frost.workspace.writeFile(
            document.path,
            document.content
          );
          useIDEStore.getState().markDocumentSaved(document.path);
          frostLanguageService.saveDocument(
            document.uri,
            document.content
          );
          return true;
        } catch (error) {
          const detail =
            error instanceof Error ? error.message : String(error);
          if (!silent) {
            if (
              document.isUntitled &&
              /EEXIST|already exists|已经存在|已存在/i.test(detail)
            ) {
              window.alert(
                `无法创建 ${document.name}\n\n${detail}\n\n请在左侧重新输入文件名。`
              );
            } else {
              pushToast({
                tone: "error",
                title: `无法保存 ${document.name}`,
                detail
              });
            }
          }
          return false;
        } finally {
          savingDocuments.current.delete(document.path);
        }
      })();
      savingDocuments.current.set(document.path, operation);
      return operation;
    },
    [pushToast]
  );

  const saveAllDocuments = useCallback(
    async (silent = true) => {
      const pending = useIDEStore
        .getState()
        .documents.filter(
          (document) =>
            !document.isUntitled &&
            document.content !== document.savedContent
        )
        .map((document) => saveDocument(document.path, silent));
      if (pending.length === 0) {
        return true;
      }
      const results = await Promise.all(pending);
      return results.every(Boolean);
    },
    [saveDocument]
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      void saveAllDocuments(true);
    }, appInfo?.testAutoSaveIntervalMs ?? 20_000);
    return () => window.clearInterval(interval);
  }, [appInfo?.testAutoSaveIntervalMs, saveAllDocuments]);

  useEffect(() => {
    let closing = false;
    return window.frost.app.onBeforeClose(() => {
      if (closing) {
        return;
      }
      const draft = useIDEStore
        .getState()
        .documents.find((document) => document.isUntitled);
      if (draft) {
        const state = useIDEStore.getState();
        state.activateDocument(draft.path);
        state.setActivity("explorer");
        state.setMode("files");
        pushToast({
          tone: "info",
          title: "还有文件没有命名",
          detail: "请在左侧输入文件名并按 Enter，或点击 × 取消新建。"
        });
        window.frost.app.cancelClose();
        return;
      }
      closing = true;
      void saveAllDocuments(false).then((saved) => {
        if (saved) {
          window.frost.app.confirmClose();
          return;
        }
        closing = false;
        window.frost.app.cancelClose();
      });
    });
  }, [pushToast, saveAllDocuments]);

  const runActiveDocument = useCallback(async () => {
    if (runStarting.current) {
      return;
    }
    runStarting.current = true;
    try {
      const state = useIDEStore.getState();
      const document = state.documents.find(
        (item) => item.path === state.activeDocumentPath
      );
      if (!document || !document.path.toLowerCase().endsWith(".py")) {
        pushToast({
          tone: "info",
          title: "请先打开一个 Python 文件"
        });
        return;
      }
      if (!(await saveDocument(document.path))) {
        return;
      }
      const terminal = await window.frost.terminal.create({
        type: "run",
        filePath: document.path,
        cols: 110,
        rows: 24
      });
      addTerminal({ ...terminal, state: "running" });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法启动 Python",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      runStarting.current = false;
    }
  }, [addTerminal, pushToast, saveDocument]);

  const stopActiveTerminal = useCallback(async () => {
    const terminal =
      terminals.find((item) => item.id === activeTerminalId) ??
      terminals.find((item) => item.state === "running");
    if (terminal?.state === "running") {
      await window.frost.terminal.kill(terminal.id);
    }
  }, [activeTerminalId, terminals]);

  const createRepl = useCallback(async () => {
    if (!workspace) {
      pushToast({
        tone: "info",
        title: "请先打开工作区文件夹",
        detail: "交互环境需要一个工作目录。"
      });
      return null;
    }
    try {
      const label = `Python 交互 #${replSequence.current++}`;
      const terminal = await window.frost.terminal.create({
        type: "repl",
        cwd: workspace.path,
        label,
        cols: 70,
        rows: 30
      });
      const session: TerminalSession = {
        ...terminal,
        state: "running"
      };
      addRepl(session);
      return session;
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法创建交互环境",
        detail: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }, [addRepl, pushToast, workspace]);

  const changeMode = useCallback(
    async (nextMode: WorkspaceMode) => {
      setActivity("explorer");
      if (nextMode === "interactive") {
        const shouldCreate =
          mode === "interactive" || replSessions.length === 0;
        setMode("interactive");
        if (shouldCreate) {
          await createRepl();
        }
      } else {
        setMode("files");
      }
    },
    [
      createRepl,
      mode,
      replSessions.length,
      setActivity,
      setMode
    ]
  );

  const handleWorkspaceChange = useCallback(
    async (nextWorkspace: WorkspaceInfo) => {
      for (const terminal of [
        ...useIDEStore.getState().terminals,
        ...useIDEStore.getState().replSessions
      ]) {
        if (terminal.state === "running") {
          await window.frost.terminal.kill(terminal.id);
        }
        terminalBus.forget(terminal.id);
      }
      frostLanguageService.setReady(false);
      frostLanguageService.resetDocuments();
      setWorkspace(nextWorkspace);
      setLspStatus({
        state: "starting",
        message: "正在切换工作区"
      });
      try {
        await window.frost.lsp.restart(nextWorkspace.path);
      } catch (error) {
        pushToast({
          tone: "error",
          title: "无法启动新工作区的智能补全",
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [pushToast, setWorkspace]
  );

  const chooseWorkspace = useCallback(async () => {
    if (
      documents.some(
        (document) => document.content !== document.savedContent
      ) &&
      !window.confirm("还有未保存的文件，切换工作区会丢失这些改动。继续吗？")
    ) {
      return;
    }
    const next = await window.frost.workspace.choose();
    if (next) {
      await handleWorkspaceChange(next);
    }
  }, [documents, handleWorkspaceChange]);

  const createStarterFile = useCallback(async (parentPath?: string) => {
    let targetWorkspace = workspace;
    if (!targetWorkspace) {
      const next = await window.frost.workspace.choose();
      if (!next) {
        return null;
      }
      await handleWorkspaceChange(next);
      targetWorkspace = next;
    }
    setActivity("explorer");
    setMode("files");
    return createUntitledDocument(parentPath ?? targetWorkspace.path);
  }, [
    createUntitledDocument,
    setActivity,
    setMode,
    workspace,
    handleWorkspaceChange
  ]);

  const choosePdf = useCallback(async () => {
    try {
      const selected = await window.frost.pdf.choose();
      if (selected) {
        openPdf(selected);
      }
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法打开 PDF",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }, [openPdf, pushToast]);

  const togglePdf = useCallback(() => {
    if (!activePdf) {
      void choosePdf();
      return;
    }
    setPdfVisible(!pdfVisible);
  }, [activePdf, choosePdf, pdfVisible, setPdfVisible]);

  const closeActiveDocument = useCallback(() => {
    const state = useIDEStore.getState();
    const document = state.documents.find(
      (item) => item.path === state.activeDocumentPath
    );
    if (!document) {
      return false;
    }
    if (
      document.content !== document.savedContent &&
      !window.confirm(`${document.name} 还有未保存的内容，确定关闭吗？`)
    ) {
      return true;
    }
    frostLanguageService.closeDocument(document.uri);
    state.closeDocument(document.path);
    return true;
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;
      if (event.key === "F5") {
        event.preventDefault();
        void runActiveDocument();
        return;
      }
      if (!command) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        void chooseWorkspace();
      } else if (key === "n") {
        event.preventDefault();
        void createStarterFile();
      } else if (key === "j") {
        event.preventDefault();
        setBottomVisible(!useIDEStore.getState().bottomVisible);
      } else if (key === "w" && closeActiveDocument()) {
        event.preventDefault();
      } else if (event.shiftKey && key === "m") {
        event.preventDefault();
        setBottomPanelTab("problems");
      } else if (event.altKey && key === "p") {
        event.preventDefault();
        togglePdf();
      }
    };
    window.addEventListener("keydown", handleShortcut, true);
    return () => window.removeEventListener("keydown", handleShortcut, true);
  }, [
    chooseWorkspace,
    closeActiveDocument,
    createStarterFile,
    runActiveDocument,
    setBottomPanelTab,
    setBottomVisible,
    togglePdf
  ]);

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = bottomHeight;
    const move = (moveEvent: PointerEvent) => {
      const next = startHeight + startY - moveEvent.clientY;
      setBottomHeight(Math.max(145, Math.min(520, next)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const startPdfResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = pdfWidth;
    const move = (moveEvent: PointerEvent) => {
      const available = Math.max(330, window.innerWidth - 650);
      const next = startWidth + startX - moveEvent.clientX;
      setPdfWidth(Math.max(330, Math.min(760, available, next)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <div className="app-shell">
      <TitleBar
        onRun={() => void runActiveDocument()}
        onStop={() => void stopActiveTerminal()}
        onTogglePdf={togglePdf}
        onModeChange={(nextMode) => void changeMode(nextMode)}
      />
      <div className="app-body">
        <ActivityBar />
        {activity === "explorer" && (
          <Explorer
            onWorkspaceChange={handleWorkspaceChange}
            onCreateFile={(parentPath) =>
              createStarterFile(parentPath)
            }
            onCommitUntitled={(path) =>
              saveDocument(path, false, true)
            }
          />
        )}
        {activity === "packages" && <PackageSidebar />}
        {activity === "settings" && <SettingsSidebar />}
        <div className="main-stage">
          <div
            className={`main-view ${
              activity === "explorer" && mode === "files"
                ? "visible"
                : ""
            }`}
          >
            <EditorWorkspace
              onSave={saveDocument}
              onOpenFolder={() => void chooseWorkspace()}
              onCreateFile={() => void createStarterFile()}
              onInteractive={() => void changeMode("interactive")}
            />
          </div>
          <div
            className={`main-view ${
              activity === "explorer" && mode === "interactive"
                ? "visible"
                : ""
            }`}
          >
            <ReplWorkspace onCreate={createRepl} />
          </div>
          <div
            className={`main-view ${
              activity === "packages" ? "visible" : ""
            }`}
          >
            {activity === "packages" && <PackageManager />}
          </div>
          <div
            className={`main-view ${
              activity === "settings" ? "visible" : ""
            }`}
          >
            {activity === "settings" && <SettingsPanel />}
          </div>

          <div
            className={`bottom-resize-handle ${
              activity === "explorer" &&
              mode === "files" &&
              bottomVisible
                ? "visible"
                : ""
            }`}
            onPointerDown={startResize}
          />
          <div
            className={`bottom-container ${
              activity === "explorer" &&
              mode === "files" &&
              bottomVisible
                ? "visible"
                : ""
            }`}
            style={{
              height:
                activity === "explorer" &&
                mode === "files" &&
                bottomVisible
                  ? bottomHeight
                  : 0
            }}
          >
            <BottomPanel />
          </div>
        </div>
        <div
          className={`pdf-resize-handle ${
            activePdf && pdfVisible ? "visible" : ""
          }`}
          onPointerDown={startPdfResize}
          title="拖动调整 PDF 阅读器宽度"
        />
        {activePdf && <PdfReaderPanel width={pdfWidth} />}
      </div>
      <StatusBar lspStatus={lspStatus} />
      <ToastStack />
    </div>
  );
}
