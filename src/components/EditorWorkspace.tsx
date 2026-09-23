import Editor, {
  type BeforeMount,
  type OnMount
} from "@monaco-editor/react";
import {
  ChevronRight,
  Circle,
  FileCode2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { editor } from "monaco-editor";
import { frostLanguageService } from "../lib/lsp";
import { languageForPath, relativePath } from "../lib/paths";
import { useIDEStore } from "../store/useIDEStore";
import { Welcome } from "./Welcome";

interface EditorWorkspaceProps {
  onSave: (path?: string) => Promise<boolean>;
  onOpenFolder: () => void;
  onCreateFile: () => void;
  onInteractive: () => void;
}

export function EditorWorkspace({
  onSave,
  onOpenFolder,
  onCreateFile,
  onInteractive
}: EditorWorkspaceProps) {
  const workspace = useIDEStore((state) => state.workspace);
  const documents = useIDEStore((state) => state.documents);
  const activeDocumentPath = useIDEStore(
    (state) => state.activeDocumentPath
  );
  const activateDocument = useIDEStore(
    (state) => state.activateDocument
  );
  const updateDocument = useIDEStore((state) => state.updateDocument);
  const closeDocument = useIDEStore((state) => state.closeDocument);
  const setCursor = useIDEStore((state) => state.setCursor);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const activeDocument = useMemo(
    () =>
      documents.find(
        (document) => document.path === activeDocumentPath
      ) ?? null,
    [activeDocumentPath, documents]
  );

  useEffect(() => {
    for (const document of documents) {
      if (
        !document.isUntitled &&
        languageForPath(document.path) === "python"
      ) {
        frostLanguageService.openDocument(
          document.uri,
          document.content,
          document.version
        );
      }
    }
  }, [documents]);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    monaco.editor.defineTheme("frost-night", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "67839d", fontStyle: "italic" },
        { token: "keyword", foreground: "c29bff" },
        { token: "string", foreground: "8ae0ba" },
        { token: "number", foreground: "f5ca89" },
        { token: "type.identifier", foreground: "76d9f2" },
        { token: "identifier", foreground: "dce9f7" },
        { token: "delimiter", foreground: "8297ac" }
      ],
      colors: {
        "editor.background": "#07111f",
        "editor.foreground": "#dce9f7",
        "editorLineNumber.foreground": "#40566e",
        "editorLineNumber.activeForeground": "#9ab6cc",
        "editorCursor.foreground": "#72e6ff",
        "editor.selectionBackground": "#245b7a88",
        "editor.inactiveSelectionBackground": "#1d456066",
        "editor.lineHighlightBackground": "#0b192a",
        "editorIndentGuide.background1": "#15263a",
        "editorIndentGuide.activeBackground1": "#31516a",
        "editorBracketHighlight.foreground1": "#71e3fa",
        "editorBracketHighlight.foreground2": "#c39aff",
        "editorBracketHighlight.foreground3": "#f3cd83",
        "editorBracketHighlight.foreground4": "#83e4b8",
        "editorWidget.background": "#0b1727",
        "editorWidget.border": "#1b344a",
        "editorSuggestWidget.background": "#0b1727",
        "editorSuggestWidget.border": "#1b344a",
        "editorSuggestWidget.selectedBackground": "#163451",
        "editorHoverWidget.background": "#0b1727",
        "editorHoverWidget.border": "#1b344a",
        "editorGutter.background": "#07111f",
        "scrollbarSlider.background": "#4a6c8333",
        "scrollbarSlider.hoverBackground": "#5c829d55",
        "scrollbarSlider.activeBackground": "#72b4d066",
        "minimap.background": "#07111f"
      }
    });
    monaco.editor.setTheme("frost-night");
    frostLanguageService.configure(monaco);
  }, []);

  const onMount: OnMount = useCallback(
    (instance, monaco) => {
      editorRef.current = instance;
      instance.addAction({
        id: "frost.save",
        label: "保存文件",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          void onSave();
        }
      });
      instance.addAction({
        id: "frost.close-editor",
        label: "关闭当前文件",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW],
        run: () => {
          const state = useIDEStore.getState();
          const document = state.documents.find(
            (item) => item.path === state.activeDocumentPath
          );
          if (!document) {
            return;
          }
          if (
            document.content !== document.savedContent &&
            !window.confirm(`${document.name} 还有未保存的内容，确定关闭吗？`)
          ) {
            return;
          }
          frostLanguageService.closeDocument(document.uri);
          state.closeDocument(document.path);
        }
      });
      instance.addAction({
        id: "frost.next-editor",
        label: "下一个文件",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab],
        run: () => {
          const state = useIDEStore.getState();
          const index = state.documents.findIndex(
            (item) => item.path === state.activeDocumentPath
          );
          const next = state.documents[(index + 1) % state.documents.length];
          if (next) {
            state.activateDocument(next.path);
          }
        }
      });
      instance.addAction({
        id: "frost.previous-editor",
        label: "上一个文件",
        keybindings: [
          monaco.KeyMod.CtrlCmd |
            monaco.KeyMod.Shift |
            monaco.KeyCode.Tab
        ],
        run: () => {
          const state = useIDEStore.getState();
          const index = state.documents.findIndex(
            (item) => item.path === state.activeDocumentPath
          );
          const previous =
            state.documents[
              (index - 1 + state.documents.length) % state.documents.length
            ];
          if (previous) {
            state.activateDocument(previous.path);
          }
        }
      });
      instance.onDidChangeCursorPosition(({ position }) => {
        setCursor(position.lineNumber, position.column);
      });
      const state = useIDEStore.getState();
      const mountedDocument = state.documents.find(
        (document) => document.path === state.activeDocumentPath
      );
      if (!mountedDocument?.isUntitled) {
        instance.focus();
      }
    },
    [onSave, setCursor]
  );

  const handleChange = (value: string | undefined) => {
    if (!activeDocument) {
      return;
    }
    const content = value ?? "";
    const nextVersion = activeDocument.version + 1;
    updateDocument(activeDocument.path, content);
    if (
      !activeDocument.isUntitled &&
      languageForPath(activeDocument.path) === "python"
    ) {
      frostLanguageService.changeDocument(
        activeDocument.uri,
        content,
        nextVersion
      );
    }
  };

  const closeTab = (path: string) => {
    const document = documents.find((item) => item.path === path);
    if (!document) {
      return;
    }
    if (
      document.content !== document.savedContent &&
      !window.confirm(`${document.name} 还有未保存的内容，确定关闭吗？`)
    ) {
      return;
    }
    frostLanguageService.closeDocument(document.uri);
    closeDocument(path);
  };

  if (!activeDocument) {
    return (
      <section className="editor-workspace">
        <Welcome
          onOpenFolder={onOpenFolder}
          onCreateFile={onCreateFile}
          onInteractive={onInteractive}
        />
      </section>
    );
  }

  const breadcrumbs = relativePath(
    workspace?.path ?? "",
    activeDocument.isUntitled ? activeDocument.name : activeDocument.path
  ).split(/[\\/]/);

  return (
    <section className="editor-workspace">
      <div className="editor-tabs">
        <div className="editor-tabs-scroll">
          {documents.map((document) => {
            const dirty = document.content !== document.savedContent;
            return (
              <div
                className={`editor-tab ${
                  document.path === activeDocument.path ? "active" : ""
                }`}
                key={document.path}
                onClick={() => activateDocument(document.path)}
                title={document.path}
                role="tab"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !document.isUntitled) {
                    activateDocument(document.path);
                  }
                }}
              >
                <FileCode2 size={14} className="tab-file-icon" />
                <span>{document.name}</span>
                <span
                  className={`tab-close ${dirty ? "dirty" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(document.path);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.stopPropagation();
                      closeTab(document.path);
                    }
                  }}
                >
                  {dirty ? <Circle size={8} fill="currentColor" /> : <X size={13} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="breadcrumbs">
        {breadcrumbs.map((part, index) => (
          <span key={`${part}-${index}`}>
            {index > 0 && <ChevronRight size={12} />}
            <span className={index === breadcrumbs.length - 1 ? "current" : ""}>
              {part}
            </span>
          </span>
        ))}
      </div>
      <div className="monaco-shell">
        <Editor
          key={activeDocument.uri}
          path={activeDocument.uri}
          language={
            activeDocument.isUntitled
              ? "python"
              : languageForPath(activeDocument.name)
          }
          value={activeDocument.content}
          beforeMount={beforeMount}
          onMount={onMount}
          onChange={handleChange}
          theme="frost-night"
          loading={
            <div className="editor-loading">
              <span className="spinner" />
              正在唤醒编辑器…
            </div>
          }
          options={{
            acceptSuggestionOnEnter: "on",
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            cursorWidth: 2,
            fontFamily:
              '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace',
            fontLigatures: true,
            fontSize: 14,
            formatOnPaste: true,
            glyphMargin: true,
            guides: {
              bracketPairs: true,
              indentation: true,
              highlightActiveIndentation: true
            },
            lineHeight: 23,
            minimap: {
              enabled: true,
              maxColumn: 80,
              renderCharacters: false,
              scale: 1,
              showSlider: "mouseover"
            },
            padding: { top: 14, bottom: 18 },
            quickSuggestions: {
              other: true,
              comments: false,
              strings: true
            },
            roundedSelection: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            snippetSuggestions: "bottom",
            stickyScroll: { enabled: true },
            suggest: {
              localityBonus: false,
              preview: true,
              selectionMode: "always",
              shareSuggestSelections: false,
              showStatusBar: true,
              snippetsPreventQuickSuggestions: false
            },
            suggestSelection: "first",
            suggestOnTriggerCharacters: true,
            tabCompletion: "on",
            wordBasedSuggestions: "off",
            wordWrap: "off"
          }}
        />
      </div>
    </section>
  );
}
