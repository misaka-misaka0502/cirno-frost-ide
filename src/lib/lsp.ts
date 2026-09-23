import type * as Monaco from "monaco-editor";
import { uriToFilePath } from "./paths";
import { useIDEStore } from "../store/useIDEStore";
import type { CodeDiagnostic } from "../types";

type MonacoApi = typeof Monaco;

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface MarkupContent {
  kind: "markdown" | "plaintext";
  value: string;
}

interface CompletionItem {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | MarkupContent;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?:
    | { range: LspRange; newText: string }
    | { insert: LspRange; replace: LspRange; newText: string };
  additionalTextEdits?: Array<{ range: LspRange; newText: string }>;
  tags?: number[];
  data?: unknown;
}

interface PublishDiagnostics {
  uri: string;
  diagnostics: Array<{
    range: LspRange;
    severity?: number;
    code?: string | number;
    source?: string;
    message: string;
    tags?: number[];
    relatedInformation?: Array<{
      location: { uri: string; range: LspRange };
      message: string;
    }>;
  }>;
}

function lspPosition(position: Monaco.Position): LspPosition {
  return {
    line: position.lineNumber - 1,
    character: position.column - 1
  };
}

function monacoRange(
  monaco: MonacoApi,
  range: LspRange
): Monaco.IRange {
  return new monaco.Range(
    range.start.line + 1,
    range.start.character + 1,
    range.end.line + 1,
    range.end.character + 1
  );
}

function markdownValue(
  documentation?: string | MarkupContent
): Monaco.IMarkdownString | undefined {
  if (!documentation) {
    return undefined;
  }
  if (typeof documentation === "string") {
    return { value: documentation };
  }
  return {
    value:
      documentation.kind === "markdown"
        ? documentation.value
        : documentation.value.replace(/[\\`*_{}[\]<>()#+\-.!]/g, "\\$&")
  };
}

function completionKind(monaco: MonacoApi, kind = 1) {
  const map: Record<number, Monaco.languages.CompletionItemKind> = {
    1: monaco.languages.CompletionItemKind.Text,
    2: monaco.languages.CompletionItemKind.Method,
    3: monaco.languages.CompletionItemKind.Function,
    4: monaco.languages.CompletionItemKind.Constructor,
    5: monaco.languages.CompletionItemKind.Field,
    6: monaco.languages.CompletionItemKind.Variable,
    7: monaco.languages.CompletionItemKind.Class,
    8: monaco.languages.CompletionItemKind.Interface,
    9: monaco.languages.CompletionItemKind.Module,
    10: monaco.languages.CompletionItemKind.Property,
    11: monaco.languages.CompletionItemKind.Unit,
    12: monaco.languages.CompletionItemKind.Value,
    13: monaco.languages.CompletionItemKind.Enum,
    14: monaco.languages.CompletionItemKind.Keyword,
    15: monaco.languages.CompletionItemKind.Snippet,
    16: monaco.languages.CompletionItemKind.Color,
    17: monaco.languages.CompletionItemKind.File,
    18: monaco.languages.CompletionItemKind.Reference,
    19: monaco.languages.CompletionItemKind.Folder,
    20: monaco.languages.CompletionItemKind.EnumMember,
    21: monaco.languages.CompletionItemKind.Constant,
    22: monaco.languages.CompletionItemKind.Struct,
    23: monaco.languages.CompletionItemKind.Event,
    24: monaco.languages.CompletionItemKind.Operator,
    25: monaco.languages.CompletionItemKind.TypeParameter
  };
  return map[kind] ?? monaco.languages.CompletionItemKind.Text;
}

function diagnosticSeverity(monaco: MonacoApi, severity = 3) {
  switch (severity) {
    case 1:
      return monaco.MarkerSeverity.Error;
    case 2:
      return monaco.MarkerSeverity.Warning;
    case 4:
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Info;
  }
}

function diagnosticTone(severity = 3): CodeDiagnostic["severity"] {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 4:
      return "hint";
    default:
      return "info";
  }
}

export class FrostLanguageService {
  private monaco: MonacoApi | null = null;
  private disposables: Monaco.IDisposable[] = [];
  private openedDocuments = new Map<string, number>();
  private changeTimers = new Map<string, number>();
  private notificationDisposer?: () => void;
  private ready = false;

  configure(monaco: MonacoApi) {
    if (this.monaco) {
      return;
    }
    this.monaco = monaco;

    this.disposables.push(
      monaco.languages.registerCompletionItemProvider("python", {
        triggerCharacters: [".", '"', "'", "/", "@", " "],
        provideCompletionItems: async (
          model,
          position,
          context,
          token
        ) => {
          if (!this.ready) {
            return { suggestions: [] };
          }
          const word = model.getWordUntilPosition(position);
          const currentWord = word.word.trim();
          const defaultRange = new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          );
          try {
            const response = await window.frost.lsp.request<
              CompletionItem[] | { items: CompletionItem[] } | null
            >("textDocument/completion", {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position),
              context: {
                triggerKind: context.triggerKind,
                triggerCharacter: context.triggerCharacter
              }
            });
            if (token.isCancellationRequested) {
              return { suggestions: [] };
            }
            const items = Array.isArray(response)
              ? response
              : response?.items ?? [];
            const suggestions = items
              .filter((item) => item.label !== currentWord)
              .map((item, index) => {
                const edit = item.textEdit;
                const editRange = edit
                  ? "range" in edit
                    ? edit.range
                    : edit.replace
                  : undefined;
                const suggestion: Monaco.languages.CompletionItem & {
                  __lspItem?: CompletionItem;
                } = {
                  label: item.label,
                  kind: completionKind(monaco, item.kind),
                  detail: item.detail,
                  documentation: markdownValue(item.documentation),
                  sortText: `1:${item.sortText ?? item.label}:${String(
                    index
                  ).padStart(6, "0")}`,
                  filterText: item.filterText,
                  insertText:
                    edit?.newText ?? item.insertText ?? item.label,
                  insertTextRules:
                    item.insertTextFormat === 2
                      ? monaco.languages.CompletionItemInsertTextRule
                          .InsertAsSnippet
                      : undefined,
                  range: editRange
                    ? monacoRange(monaco, editRange)
                    : defaultRange,
                  additionalTextEdits: item.additionalTextEdits?.map(
                    (additionalEdit) => ({
                      range: monacoRange(monaco, additionalEdit.range),
                      text: additionalEdit.newText
                    })
                  ),
                  tags: item.tags?.includes(1)
                    ? [monaco.languages.CompletionItemTag.Deprecated]
                    : undefined,
                  __lspItem: item
                };
                return suggestion;
              });
            if (currentWord) {
              suggestions.unshift({
                label: currentWord,
                kind: monaco.languages.CompletionItemKind.Text,
                detail: "保留当前输入",
                insertText: currentWord,
                range: defaultRange,
                filterText: currentWord,
                sortText: "0:current-input",
                preselect: true
              });
            }
            return { suggestions };
          } catch {
            return { suggestions: [] };
          }
        },
        resolveCompletionItem: async (suggestion) => {
          const lspItem = (
            suggestion as Monaco.languages.CompletionItem & {
              __lspItem?: CompletionItem;
            }
          ).__lspItem;
          if (!lspItem || !this.ready) {
            return suggestion;
          }
          try {
            const resolved = await window.frost.lsp.request<CompletionItem>(
              "completionItem/resolve",
              lspItem
            );
            return {
              ...suggestion,
              detail: resolved.detail ?? suggestion.detail,
              documentation:
                markdownValue(resolved.documentation) ??
                suggestion.documentation,
              additionalTextEdits:
                resolved.additionalTextEdits?.map((edit) => ({
                  range: monacoRange(monaco, edit.range),
                  text: edit.newText
                })) ?? suggestion.additionalTextEdits
            };
          } catch {
            return suggestion;
          }
        }
      })
    );

    this.disposables.push(
      monaco.languages.registerHoverProvider("python", {
        provideHover: async (model, position) => {
          if (!this.ready) {
            return null;
          }
          try {
            const hover = await window.frost.lsp.request<{
              contents:
                | string
                | MarkupContent
                | Array<string | MarkupContent>;
              range?: LspRange;
            } | null>("textDocument/hover", {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position)
            });
            if (!hover) {
              return null;
            }
            const values = Array.isArray(hover.contents)
              ? hover.contents
              : [hover.contents];
            return {
              contents: values
                .map((value) => markdownValue(value))
                .filter((value): value is Monaco.IMarkdownString =>
                  Boolean(value)
                ),
              range: hover.range
                ? monacoRange(monaco, hover.range)
                : undefined
            };
          } catch {
            return null;
          }
        }
      })
    );

    this.disposables.push(
      monaco.languages.registerSignatureHelpProvider("python", {
        signatureHelpTriggerCharacters: ["(", ","],
        signatureHelpRetriggerCharacters: [","],
        provideSignatureHelp: async (model, position, _token, context) => {
          if (!this.ready) {
            return null;
          }
          try {
            const response = await window.frost.lsp.request<{
              signatures: Array<{
                label: string;
                documentation?: string | MarkupContent;
                parameters?: Array<{
                  label: string | [number, number];
                  documentation?: string | MarkupContent;
                }>;
                activeParameter?: number;
              }>;
              activeSignature?: number;
              activeParameter?: number;
            } | null>("textDocument/signatureHelp", {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position),
              context: {
                triggerKind: context.triggerKind,
                triggerCharacter: context.triggerCharacter,
                isRetrigger: context.isRetrigger
              }
            });
            if (!response) {
              return null;
            }
            return {
              value: {
                signatures: response.signatures.map((signature) => ({
                  label: signature.label,
                  documentation: markdownValue(signature.documentation),
                  parameters:
                    signature.parameters?.map((parameter) => ({
                      label: parameter.label,
                      documentation: markdownValue(parameter.documentation)
                    })) ?? [],
                  activeParameter: signature.activeParameter
                })),
                activeSignature: response.activeSignature ?? 0,
                activeParameter: response.activeParameter ?? 0
              },
              dispose: () => undefined
            };
          } catch {
            return null;
          }
        }
      })
    );

    this.disposables.push(
      monaco.languages.registerDefinitionProvider("python", {
        provideDefinition: async (model, position) => {
          if (!this.ready) {
            return null;
          }
          try {
            const response = await window.frost.lsp.request<
              | { uri: string; range: LspRange }
              | Array<{ uri: string; range: LspRange }>
              | null
            >("textDocument/definition", {
              textDocument: { uri: model.uri.toString() },
              position: lspPosition(position)
            });
            if (!response) {
              return null;
            }
            const locations = Array.isArray(response) ? response : [response];
            await Promise.all(
              locations.map(async (location) => {
                const uri = monaco.Uri.parse(location.uri);
                if (!monaco.editor.getModel(uri)) {
                  try {
                    const content = await window.frost.workspace.readFile(
                      uriToFilePath(location.uri)
                    );
                    monaco.editor.createModel(content, "python", uri);
                  } catch {
                    // Definitions outside the workspace may be virtual stubs.
                  }
                }
              })
            );
            return locations.map((location) => ({
              uri: monaco.Uri.parse(location.uri),
              range: monacoRange(monaco, location.range)
            }));
          } catch {
            return null;
          }
        }
      })
    );

    this.notificationDisposer = window.frost.lsp.onNotification(
      ({ method, params }) => {
        if (
          method === "textDocument/publishDiagnostics" &&
          this.monaco
        ) {
          this.publishDiagnostics(params as PublishDiagnostics);
        }
      }
    );
  }

  setReady(ready: boolean) {
    this.ready = ready;
  }

  openDocument(uri: string, text: string, version: number) {
    if (this.openedDocuments.has(uri)) {
      return;
    }
    this.openedDocuments.set(uri, version);
    window.frost.lsp.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "python",
        version,
        text
      }
    });
  }

  changeDocument(uri: string, text: string, version: number) {
    if (!this.openedDocuments.has(uri)) {
      this.openDocument(uri, text, version);
      return;
    }
    this.openedDocuments.set(uri, version);
    const existingTimer = this.changeTimers.get(uri);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const timer = window.setTimeout(() => {
      window.frost.lsp.notify("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text }]
      });
      this.changeTimers.delete(uri);
    }, 90);
    this.changeTimers.set(uri, timer);
  }

  saveDocument(uri: string, text: string) {
    if (!this.openedDocuments.has(uri)) {
      return;
    }
    window.frost.lsp.notify("textDocument/didSave", {
      textDocument: { uri },
      text
    });
  }

  closeDocument(uri: string) {
    if (!this.openedDocuments.has(uri)) {
      return;
    }
    window.frost.lsp.notify("textDocument/didClose", {
      textDocument: { uri }
    });
    this.openedDocuments.delete(uri);
    useIDEStore.getState().clearDiagnostics(uri);
    const model = this.monaco?.editor.getModel(this.monaco.Uri.parse(uri));
    if (model) {
      this.monaco?.editor.setModelMarkers(model, "pyright", []);
    }
  }

  resetDocuments() {
    for (const uri of this.openedDocuments.keys()) {
      this.closeDocument(uri);
    }
    this.openedDocuments.clear();
    useIDEStore.getState().clearDiagnostics();
  }

  private publishDiagnostics(payload: PublishDiagnostics) {
    if (!this.monaco) {
      return;
    }
    const diagnosticPath = uriToFilePath(payload.uri);
    const normalizedDiagnosticPath = diagnosticPath.toLowerCase();
    const uri = this.monaco.Uri.parse(payload.uri);
    const model =
      this.monaco.editor.getModel(uri) ??
      this.monaco.editor
        .getModels()
        .find(
          (candidate) =>
            uriToFilePath(candidate.uri.toString()).toLowerCase() ===
            normalizedDiagnosticPath
        );
    const documentUri = model?.uri.toString() ?? payload.uri;
    const diagnostics: CodeDiagnostic[] = payload.diagnostics.map(
      (diagnostic, index) => ({
        id: `${documentUri}:${diagnostic.range.start.line}:${diagnostic.range.start.character}:${index}`,
        uri: documentUri,
        path: diagnosticPath,
        fileName: diagnosticPath.split(/[\\/]/).at(-1) ?? payload.uri,
        severity: diagnosticTone(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source ?? "Pyright",
        code:
          diagnostic.code === undefined ? undefined : String(diagnostic.code),
        line: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
        endLine: diagnostic.range.end.line + 1,
        endColumn: diagnostic.range.end.character + 1
      })
    );
    useIDEStore.getState().setDiagnostics(documentUri, diagnostics);
    if (!model) {
      return;
    }
    const markers: Monaco.editor.IMarkerData[] = payload.diagnostics.map(
      (diagnostic) => ({
        ...monacoRange(this.monaco!, diagnostic.range),
        severity: diagnosticSeverity(
          this.monaco!,
          diagnostic.severity
        ),
        message: diagnostic.message,
        source: diagnostic.source ?? "Pyright",
        code:
          diagnostic.code === undefined ? undefined : String(diagnostic.code),
        tags: diagnostic.tags?.map((tag) =>
          tag === 1
            ? this.monaco!.MarkerTag.Unnecessary
            : this.monaco!.MarkerTag.Deprecated
        ),
        relatedInformation: diagnostic.relatedInformation?.map((item) => ({
          resource: this.monaco!.Uri.parse(item.location.uri),
          ...monacoRange(this.monaco!, item.location.range),
          message: item.message
        }))
      })
    );
    this.monaco.editor.setModelMarkers(model, "pyright", markers);
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.notificationDisposer?.();
    this.resetDocuments();
    this.monaco = null;
  }
}

export const frostLanguageService = new FrostLanguageService();
