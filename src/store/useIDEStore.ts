import { create } from "zustand";
import { basename, filePathToUri } from "../lib/paths";
import { normalizePythonFileName } from "../lib/pythonFileName";
import type {
  Activity,
  AppInfo,
  BottomPanelTab,
  CodeDiagnostic,
  OpenDocument,
  OpenPdf,
  TerminalSession,
  ToastMessage,
  WorkspaceInfo,
  WorkspaceMode
} from "../types";

interface IDEState {
  appInfo: AppInfo | null;
  workspace: WorkspaceInfo | null;
  activity: Activity;
  mode: WorkspaceMode;
  documents: OpenDocument[];
  activeDocumentPath: string | null;
  openPdfs: OpenPdf[];
  activePdf: OpenPdf | null;
  pdfVisible: boolean;
  bottomVisible: boolean;
  bottomPanelTab: BottomPanelTab;
  diagnostics: CodeDiagnostic[];
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  replSessions: TerminalSession[];
  toasts: ToastMessage[];
  explorerRevision: number;
  cursor: { line: number; column: number };
  setAppInfo: (info: AppInfo) => void;
  setWorkspace: (workspace: WorkspaceInfo | null) => void;
  setActivity: (activity: Activity) => void;
  setMode: (mode: WorkspaceMode) => void;
  openDocument: (path: string, content: string) => void;
  createUntitledDocument: (parentPath?: string) => string;
  renameUntitledDocument: (path: string, name: string) => void;
  finalizeUntitledDocument: (
    temporaryPath: string,
    filePath: string,
    content: string
  ) => void;
  activateDocument: (path: string) => void;
  updateDocument: (path: string, content: string) => void;
  markDocumentSaved: (path: string) => void;
  closeDocument: (path: string) => void;
  closeAllDocuments: () => void;
  renameDocumentPath: (oldPath: string, newPath: string) => void;
  removeDocumentsUnder: (targetPath: string) => void;
  openPdf: (pdf: OpenPdf) => void;
  selectPdf: (path: string) => void;
  setPdfVisible: (visible: boolean) => void;
  closePdf: (path?: string) => void;
  renamePdfPath: (oldPath: string, newPath: string) => void;
  closePdfUnder: (targetPath: string) => void;
  setBottomVisible: (visible: boolean) => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  setDiagnostics: (uri: string, diagnostics: CodeDiagnostic[]) => void;
  clearDiagnostics: (uri?: string) => void;
  addTerminal: (terminal: TerminalSession) => void;
  setActiveTerminal: (id: string) => void;
  markTerminalExited: (id: string, exitCode: number) => void;
  removeTerminal: (id: string) => void;
  addRepl: (terminal: TerminalSession) => void;
  markReplExited: (id: string, exitCode: number) => void;
  removeRepl: (id: string) => void;
  pushToast: (toast: Omit<ToastMessage, "id">) => void;
  dismissToast: (id: string) => void;
  refreshExplorer: () => void;
  setCursor: (line: number, column: number) => void;
}

export const useIDEStore = create<IDEState>((set, get) => ({
  appInfo: null,
  workspace: null,
  activity: "explorer",
  mode: "files",
  documents: [],
  activeDocumentPath: null,
  openPdfs: [],
  activePdf: null,
  pdfVisible: false,
  bottomVisible: true,
  bottomPanelTab: "problems",
  diagnostics: [],
  terminals: [],
  activeTerminalId: null,
  replSessions: [],
  toasts: [],
  explorerRevision: 0,
  cursor: { line: 1, column: 1 },

  setAppInfo: (appInfo) => set({ appInfo }),
  setWorkspace: (workspace) =>
    set({
      workspace,
      documents: [],
      activeDocumentPath: null,
      terminals: [],
      activeTerminalId: null,
      replSessions: [],
      mode: "files",
      diagnostics: [],
      bottomPanelTab: "problems",
      explorerRevision: get().explorerRevision + 1
    }),
  setActivity: (activity) => set({ activity }),
  setMode: (mode) => set({ mode }),

  openDocument: (path, content) => {
    const existing = get().documents.find((document) => document.path === path);
    if (existing) {
      set({ activeDocumentPath: path });
      return;
    }
    const document: OpenDocument = {
      path,
      uri: filePathToUri(path),
      name: basename(path),
      content,
      savedContent: content,
      version: 1
    };
    set((state) => ({
      documents: [...state.documents, document],
      activeDocumentPath: path,
      mode: "files"
    }));
  },
  createUntitledDocument: (parentPath) => {
    const state = get();
    let sequence = 1;
    const usedNames = new Set(
      state.documents.map((document) => document.name.toLowerCase())
    );
    while (usedNames.has(`untitled-${sequence}.py`)) {
      sequence += 1;
    }
    const id = crypto.randomUUID();
    const path = `untitled:${id}`;
    const document: OpenDocument = {
      path,
      uri: `untitled://${id}`,
      name: `untitled-${sequence}.py`,
      content: "",
      savedContent: "",
      version: 1,
      isUntitled: true,
      parentPath,
      draftName: `untitled-${sequence}`
    };
    set((current) => ({
      documents: [...current.documents, document],
      activeDocumentPath: path,
      mode: "files"
    }));
    return path;
  },
  renameUntitledDocument: (path, name) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.path === path && document.isUntitled
          ? {
              ...document,
              draftName: name,
              name: (() => {
                try {
                  return normalizePythonFileName(name);
                } catch {
                  return name || "未命名.py";
                }
              })()
            }
          : document
      )
    })),
  finalizeUntitledDocument: (temporaryPath, filePath, content) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.path === temporaryPath
          ? {
              ...document,
              path: filePath,
              uri: filePathToUri(filePath),
              name: basename(filePath),
              content,
              savedContent: content,
              isUntitled: false,
              parentPath: undefined,
              draftName: undefined
            }
          : document
      ),
      activeDocumentPath:
        state.activeDocumentPath === temporaryPath
          ? filePath
          : state.activeDocumentPath
    })),
  activateDocument: (activeDocumentPath) => set({ activeDocumentPath }),
  updateDocument: (path, content) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.path === path
          ? {
              ...document,
              content,
              version: document.version + 1
            }
          : document
      )
    })),
  markDocumentSaved: (path) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.path === path
          ? { ...document, savedContent: document.content }
          : document
      )
    })),
  closeDocument: (path) =>
    set((state) => {
      const index = state.documents.findIndex(
        (document) => document.path === path
      );
      const documents = state.documents.filter(
        (document) => document.path !== path
      );
      let activeDocumentPath = state.activeDocumentPath;
      if (activeDocumentPath === path) {
        activeDocumentPath =
          documents[Math.min(index, documents.length - 1)]?.path ?? null;
      }
      return { documents, activeDocumentPath };
    }),
  closeAllDocuments: () =>
    set({ documents: [], activeDocumentPath: null }),
  renameDocumentPath: (oldPath, newPath) =>
    set((state) => ({
      documents: state.documents.map((document) => {
        if (
          document.path === oldPath ||
          document.path.startsWith(`${oldPath}\\`) ||
          document.path.startsWith(`${oldPath}/`)
        ) {
          const suffix = document.path.slice(oldPath.length);
          const path = `${newPath}${suffix}`;
          return {
            ...document,
            path,
            uri: filePathToUri(path),
            name: basename(path)
          };
        }
        return document;
      }),
      activeDocumentPath:
        state.activeDocumentPath === oldPath ||
        state.activeDocumentPath?.startsWith(`${oldPath}\\`) ||
        state.activeDocumentPath?.startsWith(`${oldPath}/`)
          ? `${newPath}${state.activeDocumentPath.slice(oldPath.length)}`
          : state.activeDocumentPath
    })),
  removeDocumentsUnder: (targetPath) =>
    set((state) => {
      const matches = (candidate: string) =>
        candidate === targetPath ||
        candidate.startsWith(`${targetPath}\\`) ||
        candidate.startsWith(`${targetPath}/`);
      const documents = state.documents.filter(
        (document) => !matches(document.path)
      );
      const activeDocumentPath =
        state.activeDocumentPath && matches(state.activeDocumentPath)
          ? documents.at(-1)?.path ?? null
          : state.activeDocumentPath;
      return { documents, activeDocumentPath };
    }),
  openPdf: (pdf) =>
    set((state) => {
      const existing = state.openPdfs.find(
        (item) => item.path === pdf.path
      );
      const activePdf = existing ?? pdf;
      return {
        openPdfs: existing
          ? state.openPdfs
          : [...state.openPdfs, pdf],
        activePdf,
        pdfVisible: true
      };
    }),
  selectPdf: (path) =>
    set((state) => {
      const activePdf =
        state.openPdfs.find((pdf) => pdf.path === path) ??
        state.activePdf;
      return { activePdf, pdfVisible: Boolean(activePdf) };
    }),
  setPdfVisible: (pdfVisible) => set({ pdfVisible }),
  closePdf: (path) =>
    set((state) => {
      const targetPath = path ?? state.activePdf?.path;
      if (!targetPath) {
        return {};
      }
      const index = state.openPdfs.findIndex(
        (pdf) => pdf.path === targetPath
      );
      const openPdfs = state.openPdfs.filter(
        (pdf) => pdf.path !== targetPath
      );
      const activePdf =
        state.activePdf?.path === targetPath
          ? openPdfs[Math.min(Math.max(index, 0), openPdfs.length - 1)] ??
            null
          : state.activePdf;
      return {
        openPdfs,
        activePdf,
        pdfVisible: openPdfs.length > 0 ? state.pdfVisible : false
      };
    }),
  renamePdfPath: (oldPath, newPath) =>
    set((state) => {
      const matches = (candidate: string) =>
        candidate === oldPath ||
        candidate.startsWith(`${oldPath}\\`) ||
        candidate.startsWith(`${oldPath}/`);
      const renamePdf = (pdf: OpenPdf) => {
        if (!matches(pdf.path)) {
          return pdf;
        }
        const path = `${newPath}${pdf.path.slice(oldPath.length)}`;
        return { path, name: basename(path) };
      };
      return {
        openPdfs: state.openPdfs.map(renamePdf),
        activePdf: state.activePdf
          ? renamePdf(state.activePdf)
          : null
      };
    }),
  closePdfUnder: (targetPath) =>
    set((state) => {
      const matches = (candidate: string) =>
        candidate === targetPath ||
        candidate.startsWith(`${targetPath}\\`) ||
        candidate.startsWith(`${targetPath}/`);
      const openPdfs = state.openPdfs.filter(
        (pdf) => !matches(pdf.path)
      );
      const activePdf =
        state.activePdf && matches(state.activePdf.path)
          ? openPdfs.at(-1) ?? null
          : state.activePdf;
      return {
        openPdfs,
        activePdf,
        pdfVisible: openPdfs.length > 0 ? state.pdfVisible : false
      };
    }),

  setBottomVisible: (bottomVisible) => set({ bottomVisible }),
  setBottomPanelTab: (bottomPanelTab) =>
    set({ bottomPanelTab, bottomVisible: true }),
  setDiagnostics: (uri, diagnostics) =>
    set((state) => {
      const nextDiagnostics = [
        ...state.diagnostics.filter((item) => item.uri !== uri),
        ...diagnostics
      ];
      const hasNewErrors = diagnostics.some(
        (item) => item.severity === "error"
      );
      return {
        diagnostics: nextDiagnostics,
        bottomVisible: hasNewErrors ? true : state.bottomVisible,
        bottomPanelTab: hasNewErrors ? "problems" : state.bottomPanelTab
      };
    }),
  clearDiagnostics: (uri) =>
    set((state) => ({
      diagnostics: uri
        ? state.diagnostics.filter((item) => item.uri !== uri)
        : []
    })),
  addTerminal: (terminal) =>
    set((state) => ({
      terminals: [...state.terminals, terminal],
      activeTerminalId: terminal.id,
      bottomVisible: true,
      bottomPanelTab: "output"
    })),
  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId }),
  markTerminalExited: (id, exitCode) =>
    set((state) => ({
      terminals: state.terminals.map((terminal) =>
        terminal.id === id
          ? { ...terminal, state: "exited", exitCode }
          : terminal
      )
    })),
  removeTerminal: (id) =>
    set((state) => {
      const index = state.terminals.findIndex((terminal) => terminal.id === id);
      const terminals = state.terminals.filter((terminal) => terminal.id !== id);
      return {
        terminals,
        activeTerminalId:
          state.activeTerminalId === id
            ? terminals[Math.min(index, terminals.length - 1)]?.id ?? null
            : state.activeTerminalId
      };
    }),
  addRepl: (terminal) =>
    set((state) => ({
      replSessions: [...state.replSessions, terminal],
      mode: "interactive"
    })),
  markReplExited: (id, exitCode) =>
    set((state) => ({
      replSessions: state.replSessions.map((terminal) =>
        terminal.id === id
          ? { ...terminal, state: "exited", exitCode }
          : terminal
      )
    })),
  removeRepl: (id) =>
    set((state) => ({
      replSessions: state.replSessions.filter(
        (terminal) => terminal.id !== id
      )
    })),

  pushToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    window.setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id)
    })),
  refreshExplorer: () =>
    set((state) => ({ explorerRevision: state.explorerRevision + 1 })),
  setCursor: (line, column) => set({ cursor: { line, column } })
}));
